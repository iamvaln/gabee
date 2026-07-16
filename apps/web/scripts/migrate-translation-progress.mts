/**
 * ONE-OFF migration: split the old flat `translation` progress track into the two
 * per-direction keys `translation_fr_en` / `translation_en_fr` (product §4.5 rework).
 *
 * DRY-RUN IS THE DEFAULT. Nothing is written unless invoked with `--commit`.
 *
 *   Dry-run: pnpm --filter @gabee/web exec tsx scripts/migrate-translation-progress.mts
 *   Commit:  pnpm --filter @gabee/web exec tsx scripts/migrate-translation-progress.mts --commit
 *
 * Lives under scripts/ (NOT src/) so the `pnpm test` runner never globs it. Not CI.
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 * The old `progress_by_module_per_language.translation` was a PerLanguageTrack
 * `{ fr, en }` where the fr/en sub-track = the child's UI language at play time
 * (a fr-UI child's plays landed in `.fr`), exactly like the four `words_*` tracks.
 * The new schema keeps that fr/en meaning but splits the module in two by TRANSLATION
 * DIRECTION: `translation_fr_en` (cards authored fr→en, ids `translation-fr-en-…`) and
 * `translation_en_fr` (ids `translation-en-fr-…`). This script reshapes the blob:
 * it NEVER moves data between fr and en, and it NEVER touches `total_stars`.
 *
 * ── Faithfulness / limits (see task-7-report.md) ─────────────────────────────
 * The lossless parts are exact: `seen_question_ids` split, and per-DIRECTION,
 * per-LEVEL presence. CRUCIAL: a question id's `l<lesson>` segment is ALWAYS `1`
 * (the 3-lessons-plus-revision layer is synthesised app-side at runtime — see
 * apps/kid/src/lib/progression.ts). The id/event therefore tells us only WHICH
 * DIRECTION (`fr-en` vs `en-fr`) and WHICH LEVEL was played; the real per-lesson
 * detail (lessons 1/2/3 + the revision `4`, each with its banked stars) lives ONLY
 * in the old flat track's `lessons[]`. So for every direction that actually played a
 * level, we carry that old level's `lessons[]` WHOLE — never filtered by an
 * id-derived lesson (which would only ever keep lesson 1 and silently drop 2/3/4).
 * This keeps the controller-accepted grade-carry (a level played in both directions
 * carries the same lesson grades to both), bounded by `highest_level` so no direction
 * over-claims. `question_answered` events supply real `payload.level`/`payload.lesson`
 * to enrich `plays`/`last_played`; the id classifies DIRECTION only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  LessonProgress,
  LevelProgress,
  PerLanguageTrack,
  TrackProgress,
} from '@gabee/types';

// ── dotenv (packages/db/.env) BEFORE importing the db module (validates DATABASE_URL
//    at import time). apps/web has no .env of its own in dev. ──────────────────────
function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, '..', '..', '..', 'packages', 'db', '.env'));

const { prisma } = await import('../src/lib/server/db');
const { mergeTrack } = await import('../src/lib/server/services/progress-merge');

// ── Types local to this script ───────────────────────────────────────────────
type SubLang = 'fr' | 'en';
type DirKey = 'translation_fr_en' | 'translation_en_fr';
const DIR_KEYS: DirKey[] = ['translation_fr_en', 'translation_en_fr'];
const SUB_LANGS: SubLang[] = ['fr', 'en'];

interface AnswerEvent {
  dirKey: DirKey;
  level: number;
  lesson: number;
  sessionId: string | null;
  clientTs: string; // ISO
}

interface ProfileRow {
  id: string;
  totalStars: number;
  raw: Record<string, unknown>; // progress_by_module_per_language, read RAW (not via Zod)
}

// ── id parsing — the ONLY place the seed prefix scheme is encoded ─────────────
// Ids look like `translation-fr-en-l1-l1-001` / `translation-en-fr-l3-l1-042`:
//   translation-<dir:fr-en|en-fr>-l<level>-l<lesson>-<seq>.
const ID_RE = /^translation-(fr-en|en-fr)-l(\d+)-l(\d+)-/;
export function parseTranslationId(
  id: string,
): { dirKey: DirKey; level: number; lesson: number } | null {
  const m = ID_RE.exec(id);
  if (!m) return null;
  const dirKey: DirKey = m[1] === 'fr-en' ? 'translation_fr_en' : 'translation_en_fr';
  return { dirKey, level: Number(m[2]), lesson: Number(m[3]) };
}

// ── helpers over the raw old shape ───────────────────────────────────────────
function emptyTrack(): TrackProgress {
  return { highest_level: 1, levels: [] };
}
function emptyPair(): PerLanguageTrack {
  return { fr: emptyTrack(), en: emptyTrack() };
}
/** A track is "populated" if it has any level detail or an unlocked level > 1. */
function isPopulated(t: TrackProgress | undefined): boolean {
  if (!t) return false;
  return (t.levels?.length ?? 0) > 0 || (t.highest_level ?? 1) > 1;
}
function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * Reconstruct, for ONE old sub-track (fr or en), the two per-direction TrackProgress
 * trees. `events` are the profile's translation `question_answered` events; they are
 * only trusted for this sub-lang when it is the ONLY populated sub-lang (events carry
 * no UI-language tag, so with both fr+en populated they can't be attributed and we
 * fall back to the id-derived structure of the old blob, which IS per-sub-lang).
 *
 * Throws (→ caller SKIPs the profile) if the old sub-track's `highest_level` is
 * missing/non-finite, so we never write NaN/undefined into a reconstructed track.
 */
export function reconstructSubLang(
  oldTrack: TrackProgress,
  events: AnswerEvent[] | null,
): Record<DirKey, TrackProgress> {
  const out: Record<DirKey, TrackProgress> = {
    translation_fr_en: emptyTrack(),
    translation_en_fr: emptyTrack(),
  };

  // Guard `highest_level` up front: Math.min(x, undefined) === NaN, which must never
  // reach a stored track. A malformed sub-track SKIPs the whole profile (see run()).
  const cap = oldTrack.highest_level;
  if (typeof cap !== 'number' || !Number.isFinite(cap)) {
    throw new Error('old translation sub-track has missing/invalid highest_level');
  }

  // Group event enrichment (plays/last_played/presence) by dir→level→lesson, keyed on
  // the REAL level/lesson the event payload carries (the id supplies direction only).
  interface Enrich {
    sessions: Set<string>;
    last: string | null;
  }
  const evByDir = new Map<DirKey, Map<number, Map<number, Enrich>>>();
  if (events) {
    for (const e of events) {
      const lv = (evByDir.get(e.dirKey) ?? evByDir.set(e.dirKey, new Map()).get(e.dirKey))!;
      const ls = lv.get(e.level) ?? lv.set(e.level, new Map()).get(e.level)!;
      const cur = ls.get(e.lesson) ?? { sessions: new Set<string>(), last: null };
      if (e.sessionId) cur.sessions.add(e.sessionId);
      cur.last = maxIso(cur.last, e.clientTs);
      ls.set(e.lesson, cur);
    }
  }

  for (const dirKey of DIR_KEYS) {
    const levels: LevelProgress[] = [];
    let highest = 1;

    for (const oldLevel of oldTrack.levels) {
      // Lossless: keep exactly this direction's ids at this level. Only the DIRECTION
      // and LEVEL parsed from an id are real; the id's lesson segment is always 1.
      const seenForDir = (oldLevel.seen_question_ids ?? []).filter(
        (id) => parseTranslationId(id)?.dirKey === dirKey,
      );
      const evLevels = evByDir.get(dirKey)?.get(oldLevel.level);

      // Did THIS direction play THIS level? Yes iff it has ≥1 seen id here or ≥1 event
      // here. (Level number is real in both the id and the event payload.) The id's
      // lesson is meaningless, so it plays NO part in the decision below.
      const playedHere = seenForDir.length > 0 || (evLevels?.size ?? 0) > 0;
      if (!playedHere) continue; // direction absent at this level

      // Carry the old flat level's REAL `lessons[]` WHOLE — every real lesson (1/2/3 +
      // the revision `4`) with its banked stars. NOT filtered by any id-derived lesson
      // (that would only ever keep lesson 1 and drop 2/3/4). This is the data-loss fix.
      // Events only ENRICH plays/last_played, matched on the real lesson number.
      const lessons: LessonProgress[] = (oldLevel.lessons ?? []).map((oldLesson) => {
        const enrich = evLevels?.get(oldLesson.lesson);
        const plays = enrich && enrich.sessions.size > 0 ? enrich.sessions.size : oldLesson.plays;
        const last = enrich?.last ?? oldLesson.last_played ?? null;
        return {
          // The grade the child banked for this lesson, carried verbatim (bounded to
          // the valid 0–3 range) — never fabricated, never dropped.
          lesson: oldLesson.lesson,
          stars: Math.max(0, Math.min(3, oldLesson.stars)) as LessonProgress['stars'],
          plays,
          last_played: last,
        };
      });

      // Level grade = the old flat level's banked grade, carried faithfully (bounded).
      const levelStars = Math.max(0, Math.min(3, oldLevel.stars)) as LevelProgress['stars'];
      const evAllSessions = new Set<string>();
      let evLast: string | null = null;
      if (evLevels) {
        for (const e of evLevels.values()) {
          for (const s of e.sessions) evAllSessions.add(s);
          evLast = maxIso(evLast, e.last);
        }
      }
      levels.push({
        level: oldLevel.level,
        stars: levelStars,
        plays: evAllSessions.size > 0 ? evAllSessions.size : oldLevel.plays,
        // best_time_s can't be split per direction; carry the old "best" (monotonic-safe).
        best_time_s: oldLevel.best_time_s ?? null,
        last_played: evLast ?? oldLevel.last_played ?? null,
        seen_question_ids: seenForDir,
        lessons,
      });
      highest = Math.max(highest, oldLevel.level);
    }

    // Never let a reconstructed direction unlock further than the old flat track did.
    out[dirKey] = { highest_level: Math.min(highest, cap), levels };
  }
  return out;
}

// ── Compact summaries for the before/after table ─────────────────────────────
function summariseTrack(t: TrackProgress | undefined) {
  if (!t) return { highest_level: 1, levels: [] as unknown[] };
  return {
    highest_level: t.highest_level,
    levels: t.levels.map((l) => ({
      level: l.level,
      stars: l.stars,
      lessons: l.lessons.map((x) => ({ lesson: x.lesson, stars: x.stars })),
      seen: l.seen_question_ids.length,
    })),
  };
}

interface ProfileResult {
  id: string;
  before: { fr: unknown; en: unknown };
  after: Record<DirKey, { fr: unknown; en: unknown }>;
  /** The child's real total_stars — carried untouched. NOT written (safety by OMISSION). */
  total_stars: number;
  /** seen-ids + event qids matching NEITHER direction prefix (reported, never dropped silently). */
  unclassified_ids: number;
  newBlob: Record<string, unknown>;
}

/** Count seen ids across the old blob that match neither direction prefix. */
function countUnclassifiedSeen(old: PerLanguageTrack): number {
  let n = 0;
  for (const L of SUB_LANGS) {
    const track = old[L] as TrackProgress | undefined;
    for (const lv of track?.levels ?? []) {
      for (const id of lv.seen_question_ids ?? []) {
        if (!parseTranslationId(id)) n += 1;
      }
    }
  }
  return n;
}

/**
 * Pure reshape of one profile's raw blob. Returns null when there's nothing to do.
 * `eventUnclassified` = count of `question_answered` qids that matched no direction
 * prefix (from loadAnswerEvents), folded into the reported `unclassified_ids`.
 * May THROW on a malformed blob (e.g. bad highest_level) — the caller SKIPs+continues.
 */
export function migrateProfile(
  row: ProfileRow,
  events: AnswerEvent[],
  eventUnclassified = 0,
): ProfileResult | null {
  const raw = row.raw;
  const old = raw['translation'] as PerLanguageTrack | undefined;
  if (!old || typeof old !== 'object') return null; // already migrated / never had it → no-op

  // Which sub-langs did the child actually use? (Preserve fr/en placement exactly.)
  const activeLangs = SUB_LANGS.filter((L) => isPopulated(old[L]));
  const eventsTrustworthy = activeLangs.length <= 1; // can't attribute events across both

  // Start from the existing blob, drop the old key, ensure both new keys exist.
  const newBlob: Record<string, unknown> = { ...raw };
  delete newBlob['translation'];
  const dst: Record<DirKey, PerLanguageTrack> = {
    translation_fr_en: { ...emptyPair(), ...(raw['translation_fr_en'] as PerLanguageTrack | undefined) },
    translation_en_fr: { ...emptyPair(), ...(raw['translation_en_fr'] as PerLanguageTrack | undefined) },
  };
  // Normalise possibly-missing sub-sides.
  for (const dk of DIR_KEYS) {
    dst[dk] = {
      fr: (dst[dk].fr as TrackProgress | undefined) ?? emptyTrack(),
      en: (dst[dk].en as TrackProgress | undefined) ?? emptyTrack(),
    };
  }

  for (const L of activeLangs) {
    const oldTrack = old[L];
    const recon = reconstructSubLang(oldTrack, eventsTrustworthy ? events : null);
    for (const dk of DIR_KEYS) {
      // Merge (monotonic) into whatever the new key already holds → idempotent + safe.
      dst[dk][L] = mergeTrack(dst[dk][L], recon[dk]);
    }
  }
  for (const dk of DIR_KEYS) newBlob[dk] = dst[dk];

  return {
    id: row.id,
    before: { fr: summariseTrack(old.fr), en: summariseTrack(old.en) },
    after: {
      translation_fr_en: { fr: summariseTrack(dst.translation_fr_en.fr), en: summariseTrack(dst.translation_fr_en.en) },
      translation_en_fr: { fr: summariseTrack(dst.translation_en_fr.fr), en: summariseTrack(dst.translation_en_fr.en) },
    },
    total_stars: row.totalStars, // carried untouched; never written (safety by OMISSION)
    unclassified_ids: countUnclassifiedSeen(old) + eventUnclassified,
    newBlob,
  };
}

// ── DB glue ──────────────────────────────────────────────────────────────────
export async function loadAnswerEvents(
  profileId: string,
): Promise<{ events: AnswerEvent[]; unclassified: number }> {
  const rows = await prisma.event.findMany({
    where: { profileId, name: 'question_answered' },
    select: { sessionId: true, clientTs: true, payload: true },
  });
  const out: AnswerEvent[] = [];
  let unclassified = 0;
  for (const r of rows) {
    const p = r.payload as { question_id?: unknown; level?: unknown; lesson?: unknown } | null;
    const qid = p && typeof p.question_id === 'string' ? p.question_id : null;
    if (!qid) continue;
    // The id classifies DIRECTION only — its lesson segment is always 1 and its level,
    // while real, is superseded by the event payload's own (authoritative) fields.
    const parsed = parseTranslationId(qid);
    if (!parsed) {
      // Only a TRANSLATION-module question that fails to classify by direction is a
      // genuine "unclassified" id worth flagging. `question_answered` fires for every
      // module (numbers/words/keyboard/code), whose qids aren't translation ids at all —
      // those are simply not ours, so skip them silently (don't inflate the count).
      if (qid.startsWith('translation-')) unclassified += 1;
      continue;
    }
    // Read the REAL level/lesson the event carries (report §1); fall back to the id's
    // real level only if the payload omits it. Lesson MUST come from the payload — the
    // id's lesson is meaningless (always 1).
    const level = typeof p?.level === 'number' ? p.level : parsed.level;
    const lesson = typeof p?.lesson === 'number' ? p.lesson : parsed.lesson;
    out.push({
      dirKey: parsed.dirKey,
      level,
      lesson,
      sessionId: r.sessionId ?? null,
      clientTs: r.clientTs.toISOString(),
    });
  }
  return { events: out, unclassified };
}

export async function run({ commit }: { commit: boolean }): Promise<number> {
  const profiles = await prisma.childProfile.findMany({
    select: { id: true, totalStars: true, progressByModulePerLanguage: true },
  });

  let affected = 0;
  let skipped = 0;
  console.log(`\n${commit ? '⚠️  COMMIT' : '🔎 DRY-RUN'} — scanning ${profiles.length} child profile(s)…\n`);

  for (const pr of profiles) {
    const raw = (pr.progressByModulePerLanguage ?? {}) as Record<string, unknown>;
    if (!raw['translation']) continue; // no-op (idempotent)

    // Per-profile error isolation: any malformed blob / bad field SKIPs just this one
    // profile (clear reason, no partial write) and the batch keeps going. Never abort.
    try {
      const { events, unclassified } = await loadAnswerEvents(pr.id);
      const res = migrateProfile({ id: pr.id, totalStars: pr.totalStars, raw }, events, unclassified);
      if (!res) continue;

      affected += 1;
      console.log(`── profile ${res.id} ${'─'.repeat(40)}`);
      console.log(JSON.stringify(
        {
          before: res.before,
          after: res.after,
          total_stars: res.total_stars,
          unclassified_ids: res.unclassified_ids,
        },
        null,
        2,
      ));

      // total_stars safety is by OMISSION, not by a check: the field is NEVER in the
      // update payload below, so the reshape cannot touch it. (There is deliberately no
      // before/after comparison here — a hardcoded `after === before` would be a dead
      // check that can never fire, which we refuse to present as a safety net.)
      console.log(`   ✓ total_stars untouched by design — never in the update payload (${res.total_stars})`);
      if (res.unclassified_ids > 0) {
        console.warn(`   ⚠️  ${res.unclassified_ids} unclassified translation id(s) matched neither direction prefix (e.g. pre-rework \`tr-…\` seed ids that carry NO direction). They cannot be split by direction; a level whose presence rests ONLY on such ids appears in NEITHER new direction. Review the before/after above before any --commit — do NOT commit this profile blind.`);
      }

      if (commit) {
        await prisma.childProfile.update({
          where: { id: res.id },
          // NOTE: total_stars is deliberately NOT in this update (safety by OMISSION).
          data: { progressByModulePerLanguage: res.newBlob as object },
        });
        console.log('   ✍️  written.');
      }
    } catch (err) {
      skipped += 1;
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`SKIPPED ${pr.id}: ${reason}`);
      continue;
    }
  }

  console.log(`\n${commit ? 'COMMIT' : 'DRY-RUN'} complete: ${affected} profile(s) with an old \`translation\` key${affected === 0 ? ' (nothing to migrate)' : ''}.`);
  if (skipped > 0) console.error(`❗ ${skipped} profile(s) SKIPPED on a malformed blob (see reasons above) — batch continued, nothing partial written.`);
  return skipped;
}

// ── CLI entrypoint (guarded so importing this module — e.g. from a test harness —
//    does NOT run the migration). ─────────────────────────────────────────────
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const commit = process.argv.includes('--commit');
  const skipped = await run({ commit });
  await prisma.$disconnect();
  process.exit(skipped > 0 ? 1 : 0); // non-zero if any profile was SKIPPED (operator must notice)
}
