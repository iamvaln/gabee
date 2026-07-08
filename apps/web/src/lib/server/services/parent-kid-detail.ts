import type { Module, SkinTone, HairColor, HairStyle, ShirtColor } from '@gabee/types';
import { prisma } from '../db';
import { assertParentCanAccessKid } from '../kid-access';
import { ageFromBirthDate } from '../../age';

/**
 * Parent → Kid detail data (parent spec §7.3). Owns the per-kid queries that back
 * K2's tabs — sessions list, per-module aggregates, plus a "recent family activity"
 * feed used by K1. We read directly from `Event` + `SessionClassification` rather
 * than going through the kid-app APIs because the parent surface needs aggregated
 * views the ingestion path doesn't return.
 *
 * IMPORTANT: every public function must take a `parentId` and scope all queries to
 * children of that parent — there is no row-level security in Phase 1, the service
 * layer is the boundary.
 */

export interface KidSessionRow {
  /** Session UUID — primary key into `SessionClassification`. */
  session_id: string;
  /** Start time, ISO. */
  started_at: string;
  duration_min: number | null;
  /** First module touched in the session; null until a `lesson_started` event arrives. */
  module: Module | null;
  /** Classification status — null = pending in the queue. */
  label: 'child_initiated' | 'prompted' | 'unsure' | null;
  classified_at: string | null;
}

export interface KidModuleAggregate {
  module: Module;
  sessions: number;
  total_duration_min: number;
  /** Highest level seen in any `lesson_started` event for this kid + module. */
  highest_level: number;
}

export interface KidSummary {
  id: string;
  name: string;
  skin_tone: SkinTone;
  hair_color: HairColor;
  hair_style: HairStyle;
  shirt_color: ShirtColor;
  language: 'fr' | 'en';
  /** ISO date (YYYY-MM-DD) or null; `age` is the derived whole-years value. */
  birth_date: string | null;
  age: number | null;
  created_at: string;
  last_active_at: string | null;
  /** Per-module highest unlocked level — derived from `progressByModule` JSON. */
  levels: Partial<Record<Module, number>>;
}

export interface FamilyActivityItem {
  id: string;
  /** When it happened, ISO. Used to sort + render relative time client-side. */
  ts: string;
  type: 'session_classified' | 'kid_added' | 'feedback_left' | 'session_started';
  kid_id: string;
  kid_name: string;
  /** Extra context — e.g. module for session_started, rating for feedback_left. */
  detail: string;
}

/**
 * Throws when the kid isn't accessible to this parent — keeps the service
 * layer honest. Accepts BOTH the primary parent (direct ChildProfile.parentId)
 * and co-parents linked via ParentChildLink, so a co-parent sees the same
 * read views as the primary.
 */
async function assertOwned(parentId: string, kidId: string): Promise<void> {
  await assertParentCanAccessKid(parentId, kidId);
}

/** Sessions for one kid, newest first. Used by K2 Activity tab. */
export async function listKidSessions(
  parentId: string,
  kidId: string,
  limit = 100,
): Promise<KidSessionRow[]> {
  await assertOwned(parentId, kidId);
  const rows = await prisma.sessionClassification.findMany({
    where: { profileId: kidId },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({
    session_id: r.sessionId,
    started_at: r.startedAt.toISOString(),
    duration_min: r.durationS == null ? null : Math.round(r.durationS / 60),
    module: (r.firstModule ?? null) as Module | null,
    label: r.label ?? null,
    classified_at: r.classifiedAt ? r.classifiedAt.toISOString() : null,
  }));
}

/**
 * Per-module rollup for one kid: how many sessions, total time, highest level. The
 * `highest_level` comes from `lesson_started` event payloads; the count + duration
 * come from `SessionClassification`. We do this in two queries (one per dimension)
 * rather than a single hairy join — readable, and the rowcounts are tiny per kid.
 */
export async function aggregatesByModule(
  parentId: string,
  kidId: string,
): Promise<KidModuleAggregate[]> {
  await assertOwned(parentId, kidId);

  // Sessions + duration grouped by firstModule.
  const sessionAgg = await prisma.sessionClassification.groupBy({
    by: ['firstModule'],
    where: { profileId: kidId, firstModule: { not: null } },
    _count: { _all: true },
    _sum: { durationS: true },
  });

  // Highest level per module from lesson_started events.
  const events = await prisma.event.findMany({
    where: { profileId: kidId, name: 'lesson_started' },
    select: { payload: true },
  });
  const highest: Partial<Record<Module, number>> = {};
  for (const e of events) {
    const p = e.payload as { module?: string; level?: number } | null;
    if (!p || !p.module || typeof p.level !== 'number') continue;
    const mod = p.module as Module;
    if (!highest[mod] || highest[mod]! < p.level) highest[mod] = p.level;
  }

  return sessionAgg
    .filter((r): r is typeof r & { firstModule: Module } => r.firstModule != null)
    .map((r) => ({
      module: r.firstModule,
      sessions: r._count._all,
      total_duration_min: Math.round((r._sum.durationS ?? 0) / 60),
      highest_level: highest[r.firstModule] ?? 0,
    }));
}

/** Header-summary shape for K1 cards + K2 hero. Reads the levels off the progress JSON. */
export async function listKidSummaries(parentId: string): Promise<KidSummary[]> {
  const rows = await prisma.childProfile.findMany({
    where: { parentId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    skin_tone: r.skinTone,
    hair_color: r.hairColor,
    hair_style: r.hairStyle,
    shirt_color: r.shirtColor,
    language: r.language,
    birth_date: r.birthDate ? r.birthDate.toISOString().slice(0, 10) : null,
    age: r.birthDate ? ageFromBirthDate(r.birthDate.toISOString().slice(0, 10)) : null,
    created_at: r.createdAt.toISOString(),
    last_active_at: r.lastActiveAt ? r.lastActiveAt.toISOString() : null,
    levels: levelsFromProgress(r.progressByModule, r.progressByModulePerLanguage),
  }));
}

/**
 * Single-kid version of {@link listKidSummaries}. Throws if the kid isn't
 * accessible (primary parent OR linked co-parent).
 */
export async function getKidSummary(parentId: string, kidId: string): Promise<KidSummary> {
  await assertParentCanAccessKid(parentId, kidId);
  const r = await prisma.childProfile.findUnique({ where: { id: kidId } });
  if (!r) throw new Error('profile_not_found');
  return {
    id: r.id,
    name: r.name,
    skin_tone: r.skinTone,
    hair_color: r.hairColor,
    hair_style: r.hairStyle,
    shirt_color: r.shirtColor,
    language: r.language,
    birth_date: r.birthDate ? r.birthDate.toISOString().slice(0, 10) : null,
    age: r.birthDate ? ageFromBirthDate(r.birthDate.toISOString().slice(0, 10)) : null,
    created_at: r.createdAt.toISOString(),
    last_active_at: r.lastActiveAt ? r.lastActiveAt.toISOString() : null,
    levels: levelsFromProgress(r.progressByModule, r.progressByModulePerLanguage),
  };
}

/**
 * Flatten the per-module progress JSON to a `{ module: highest_level }` map. Words
 * is split across 4 sub-modes per language; we surface the max across all sub-modes
 * as a single "words" chip (Phase 1 — sub-mode-level chips ship Phase 2A).
 */
function levelsFromProgress(
  pbm: unknown,
  ppl: unknown,
): Partial<Record<Module, number>> {
  const out: Partial<Record<Module, number>> = {};
  const a = pbm as Record<string, { highest_level?: number } | undefined> | null;
  if (a) {
    if (a.numbers?.highest_level) out.numbers = a.numbers.highest_level;
    if (a.keyboard?.highest_level) out.keyboard = a.keyboard.highest_level;
    if (a.code?.highest_level) out.code = a.code.highest_level;
  }
  const b = ppl as Record<string, { fr?: { highest_level?: number }; en?: { highest_level?: number } } | undefined> | null;
  if (b) {
    const wordsKeys = ['words_picture', 'words_fill', 'words_build', 'words_read'] as const;
    let wordsMax = 0;
    for (const k of wordsKeys) {
      const fr = b[k]?.fr?.highest_level ?? 0;
      const en = b[k]?.en?.highest_level ?? 0;
      wordsMax = Math.max(wordsMax, fr, en);
    }
    if (wordsMax > 0) out.words = wordsMax;
    const tr = Math.max(
      b.translation?.fr?.highest_level ?? 0,
      b.translation?.en?.highest_level ?? 0,
    );
    if (tr > 0) out.translation = tr;
  }
  return out;
}

/**
 * Recent family activity for K1 (parent spec §7.1 / §9.3 — Phase 1 simple). Combines:
 *   • session classification events (when a session got labelled),
 *   • new kid additions,
 *   • feedback rows tagged to a kid.
 * Returned newest-first, sliced to `limit`. Empty list is a valid result — the UI
 * renders an empty state.
 */
export async function listFamilyActivity(
  parentId: string,
  limit = 20,
): Promise<FamilyActivityItem[]> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // last 2 weeks

  const [classifications, kids, feedback] = await Promise.all([
    prisma.sessionClassification.findMany({
      where: {
        profile: { parentId },
        classifiedAt: { not: null, gte: since },
      },
      orderBy: { classifiedAt: 'desc' },
      take: limit,
      include: { profile: { select: { id: true, name: true } } },
    }),
    prisma.childProfile.findMany({
      where: { parentId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.feedback.findMany({
      where: { parentId, createdAt: { gte: since }, childId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, childId: true, rating: true, createdAt: true },
    }),
  ]);

  // Resolve child names for feedback rows (the join isn't on the schema).
  const kidIds = [...new Set(feedback.map((f) => f.childId).filter((x): x is string => !!x))];
  const kidNames = kidIds.length
    ? new Map(
        (
          await prisma.childProfile.findMany({
            where: { id: { in: kidIds } },
            select: { id: true, name: true },
          })
        ).map((k) => [k.id, k.name]),
      )
    : new Map<string, string>();

  const items: FamilyActivityItem[] = [
    ...classifications.map((c) => ({
      id: `c:${c.id}`,
      ts: c.classifiedAt!.toISOString(),
      type: 'session_classified' as const,
      kid_id: c.profile.id,
      kid_name: c.profile.name,
      detail: c.firstModule ? String(c.firstModule) : 'session',
    })),
    ...kids.map((k) => ({
      id: `k:${k.id}`,
      ts: k.createdAt.toISOString(),
      type: 'kid_added' as const,
      kid_id: k.id,
      kid_name: k.name,
      detail: '',
    })),
    ...feedback.map((f) => ({
      id: `f:${f.id}`,
      ts: f.createdAt.toISOString(),
      type: 'feedback_left' as const,
      kid_id: f.childId!,
      kid_name: kidNames.get(f.childId!) ?? '',
      detail: `${f.rating}/5`,
    })),
  ];

  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return items.slice(0, limit);
}

/** Feedback rows for one kid — backs K2 Feedback tab (Phase 1 placeholder). */
export async function listKidFeedback(parentId: string, kidId: string): Promise<
  Array<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    status: string;
    scope: string;
    target: unknown;
  }>
> {
  await assertOwned(parentId, kidId);
  const rows = await prisma.feedback.findMany({
    where: { parentId, childId: kidId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment ?? null,
    created_at: r.createdAt.toISOString(),
    status: r.status,
    scope: r.scope,
    target: r.target,
  }));
}
