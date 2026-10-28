import type { ContentPlatform } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { getStudioTimezone } from '../services/web-visits';
import { postingPlatformsOn } from './cadence';
import { localParts } from './clock';
import { auditContent, enabledPlatforms, parseSlotPlatforms, type SlotPlatform } from './drafts';
import { checkLanguageQuota } from './language-quota';
import { getPostingDays } from './settings';
import { addDaysYmd, weekdayOf, ymdOf, type Actor } from './state';
import { getWeek, skipDay, updateSlot, type WeekDto } from './weeks';

/**
 * « Appliquer le rythme à la semaine en cours »: bring a validated week's
 * future days in line with the posting cadence after it changed in Réglages.
 *
 * For each day strictly after today (studio-local) that has a line, is still
 * open and has no draft yet: its platforms become the platforms posting that
 * weekday (a kept platform keeps its language, a new one starts in French),
 * and a day no platform posts on any more is skipped (« Nouveau rythme »).
 * Today, past days and days with drafts are never touched. If the change takes
 * a platform below its English minimum, one of its remaining future posts
 * switches to English; when none can, the plan says so.
 *
 * The preview (`planRhythm`) and the change (`applyRhythm`) run the same
 * code on the server — the screen asks for the preview to fill its confirm
 * dialog rather than recomputing the cadence, the studio day, the drafts and
 * the English rebalance in the browser. Applying goes through `updateSlot` /
 * `skipDay`, so each day keeps its validation and audit row.
 */

export type RhythmChange = {
  slot_id: string;
  date: string;
  /** `adjust`: new platforms; `skip`: no platform posts that day any more. */
  kind: 'adjust' | 'skip';
  before: SlotPlatform[];
  /** Empty for a skip. */
  after: SlotPlatform[];
  /** Platforms switched to English on this day to keep the week's English minimum. */
  english_switched: ContentPlatform[];
};

export type RhythmPlan = {
  week_id: string;
  starts_on: string;
  /** Studio-local today: only later days change. */
  today: string;
  changes: RhythmChange[];
  /** Future days left as they are because drafts already exist for them. */
  kept_with_drafts: string[];
  /** Future days the new rhythm posts on that have no line in this week (they stay without a post). */
  days_without_line: string[];
  /** Platforms the plan leaves below their English minimum, with no future post left to switch. */
  english_missing: ContentPlatform[];
  /** Days adjusted and days skipped (the screens word the summary, « 3 jours ajustés, 1 jour sauté »). */
  counts: RhythmCounts;
};

export type RhythmCounts = { adjusted: number; skipped: number };

const OPEN = (status: string) => status !== 'done' && status !== 'skipped';

const countsOf = (changes: readonly RhythmChange[]): RhythmCounts => {
  const adjusted = changes.filter((c) => c.kind === 'adjust').length;
  return { adjusted, skipped: changes.length - adjusted };
};

/** Same posts, whatever their order: a line stored `[tiktok, linkedin]` already matches `[linkedin, tiktok]`. */
const key = (list: SlotPlatform[]) => list.map((p) => `${p.platform}:${p.language}`).sort().join(',');
export const samePosts = (a: SlotPlatform[], b: SlotPlatform[]) => key(a) === key(b);

/** What applying the current cadence to the week would change (writes nothing). */
export async function planRhythm(weekId: string, now: Date = new Date()): Promise<RhythmPlan> {
  const week = await prisma.contentWeek.findUnique({
    where: { id: weekId },
    include: { slots: { orderBy: { date: 'asc' }, include: { _count: { select: { drafts: true } } } } },
  });
  if (!week) throw new HttpError(404, 'week_not_found', "Cette semaine n'existe pas (ou plus). Rechargez la page.");
  if (week.status !== 'validated') {
    throw new HttpError(409, 'invalid_transition', 'Le rythme ne s’applique qu’à une semaine validée : avant validation, modifiez les jours directement.');
  }
  const [tz, postingDays, enabled] = await Promise.all([getStudioTimezone(), getPostingDays(), enabledPlatforms()]);
  const today = localParts(now, tz).date;
  const startsOn = ymdOf(week.startsOn);

  const lines = week.slots.map((s) => ({ id: s.id, date: ymdOf(s.date), status: s.status, drafts: s._count.drafts, platforms: parseSlotPlatforms(s.platforms) }));
  /** Future lines the rhythm may change. */
  const editable = lines.filter((l) => l.date > today && OPEN(l.status) && l.drafts === 0);
  const keptWithDrafts = lines.filter((l) => l.date > today && OPEN(l.status) && l.drafts > 0).map((l) => l.date);

  const changes = new Map<string, RhythmChange>();
  for (const line of editable) {
    const want = postingPlatformsOn(weekdayOf(line.date), postingDays, enabled);
    if (want.length === 0) {
      changes.set(line.id, { slot_id: line.id, date: line.date, kind: 'skip', before: line.platforms, after: [], english_switched: [] });
      continue;
    }
    const after = want.map((platform) => line.platforms.find((p) => p.platform === platform) ?? { platform, language: 'fr' as const });
    if (!samePosts(after, line.platforms)) changes.set(line.id, { slot_id: line.id, date: line.date, kind: 'adjust', before: line.platforms, after, english_switched: [] });
  }

  // The week's posts as they would be: skipped days drop out, adjusted days take their new platforms.
  const posted = (platformsOf: (l: (typeof lines)[number]) => SlotPlatform[] | null) =>
    lines.flatMap((l) => {
      const platforms = platformsOf(l);
      return platforms ? [{ platforms }] : [];
    });
  const afterOf = (l: (typeof lines)[number]): SlotPlatform[] | null => {
    if (l.status === 'skipped') return null;
    const c = changes.get(l.id);
    if (!c) return l.platforms;
    return c.kind === 'skip' ? null : c.after;
  };
  // The plan leaves a platform below its English minimum (lost to the change, or missing already):
  // its first upcoming post that can change switches to English.
  const partial = week.firstDay.getTime() > week.startsOn.getTime();
  const englishMissing: ContentPlatform[] = [];
  for (const platform of enabled) {
    const next = checkLanguageQuota(posted(afterOf), partial, [platform])[0]!;
    if (next.ok) continue;
    const candidate = editable.find((l) => afterOf(l)?.some((p) => p.platform === platform && p.language !== 'en'));
    if (!candidate) {
      englishMissing.push(platform);
      continue;
    }
    const current = afterOf(candidate)!;
    const after = current.map((p) => (p.platform === platform ? { ...p, language: 'en' as const } : p));
    const existing = changes.get(candidate.id);
    changes.set(candidate.id, {
      slot_id: candidate.id,
      date: candidate.date,
      kind: 'adjust',
      before: candidate.platforms,
      after,
      english_switched: [...(existing?.english_switched ?? []), platform],
    });
  }

  // Future days the rhythm now posts on, without a line in this week.
  const daysWithoutLine: string[] = [];
  const from = [ymdOf(week.firstDay), addDaysYmd(today, 1)].sort().at(-1)!;
  for (let date = from; date <= addDaysYmd(startsOn, 6); date = addDaysYmd(date, 1)) {
    if (!lines.some((l) => l.date === date) && postingPlatformsOn(weekdayOf(date), postingDays, enabled).length > 0) daysWithoutLine.push(date);
  }

  const ordered = [...changes.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    week_id: week.id,
    starts_on: startsOn,
    today,
    changes: ordered,
    kept_with_drafts: keptWithDrafts,
    days_without_line: daysWithoutLine,
    english_missing: englishMissing,
    counts: countsOf(ordered),
  };
}

/** The day actions `applyRhythm` goes through (a seam for tests that make one fail). */
export type RhythmSteps = { skipDay: typeof skipDay; updateSlot: typeof updateSlot };
const STEPS: RhythmSteps = { skipDay, updateSlot };

/**
 * Apply the current cadence to the week's future days (see `planRhythm`).
 * Idempotent. Each day changes on its own (with its audit row); if one fails
 * (it changed meanwhile), the days already changed stay changed, the week-level
 * audit row still records what was applied and what failed, and the error is
 * rethrown — running it again finishes the work.
 */
export async function applyRhythm(
  weekId: string,
  actor: Actor,
  now: Date = new Date(),
  steps: RhythmSteps = STEPS,
): Promise<{ plan: RhythmPlan; week: WeekDto; applied: RhythmCounts }> {
  const plan = await planRhythm(weekId, now);
  const done: RhythmChange[] = [];
  let failed: { date: string; error: string } | null = null;
  try {
    for (const change of plan.changes) {
      if (change.kind === 'skip') await steps.skipDay(change.slot_id, 'Nouveau rythme', actor);
      else await steps.updateSlot(change.slot_id, { platforms: change.after }, actor);
      done.push(change);
    }
  } catch (err) {
    failed = { date: plan.changes[done.length]!.date, error: err instanceof Error ? err.message : String(err) };
    throw err;
  } finally {
    if (plan.changes.length > 0) {
      await auditContent(actor, 'content.week.apply_rhythm', 'content_week', weekId, {
        ...countsOf(done),
        planned: plan.counts,
        changes: done.map((c) => ({ date: c.date, kind: c.kind, after: c.after, english_switched: c.english_switched })),
        english_missing: plan.english_missing,
        failed,
      });
    }
  }
  return { plan, week: await getWeek(weekId, actor.id), applied: countsOf(done) };
}
