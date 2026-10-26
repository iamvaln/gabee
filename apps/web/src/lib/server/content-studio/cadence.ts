import { CONTENT_PLATFORMS, DEFAULT_POSTING_DAYS, PostingDaysSchema, type ContentPlatform, type PostingDays } from '@gabee/types';
import { addDaysYmd, weekdayOf } from './state';

/**
 * Posting cadence (owner decision 2026-10-26): each platform posts on its own
 * studio-local weekdays (Réglages → Jours de publication), and a week plans a
 * day line only for the days at least one enabled platform posts on. Pure.
 */

/** A day the week plans, with the platforms that post on it (CONTENT_PLATFORMS order). */
export type PlannedDay = { date: string; platforms: ContentPlatform[] };

/** `StudioSettings.posting_days` as stored; a malformed value falls back to the default cadence. */
export function parsePostingDays(value: unknown): PostingDays {
  const parsed = PostingDaysSchema.safeParse(value);
  if (!parsed.success) return { linkedin: [...DEFAULT_POSTING_DAYS.linkedin], tiktok: [...DEFAULT_POSTING_DAYS.tiktok] };
  const norm = (days: number[]) => [...days].sort((a, b) => a - b);
  return { linkedin: norm(parsed.data.linkedin), tiktok: norm(parsed.data.tiktok) };
}

/** The enabled platforms posting on `weekday` (0 = Sunday … 6 = Saturday). */
export function postingPlatformsOn(weekday: number, postingDays: PostingDays, enabled: readonly ContentPlatform[]): ContentPlatform[] {
  return CONTENT_PLATFORMS.filter((p) => enabled.includes(p) && postingDays[p].includes(weekday));
}

/** The days a week plans: `firstDay` … Sunday, only those some enabled platform posts on. */
export function plannedDays(startsOn: string, firstDay: string, postingDays: PostingDays, enabled: readonly ContentPlatform[]): PlannedDay[] {
  const out: PlannedDay[] = [];
  for (let date = firstDay; date <= addDaysYmd(startsOn, 6); date = addDaysYmd(date, 1)) {
    const platforms = postingPlatformsOn(weekdayOf(date), postingDays, enabled);
    if (platforms.length > 0) out.push({ date, platforms });
  }
  return out;
}
