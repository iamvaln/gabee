import type { AccountRole } from '@gabee/types';

/**
 * Content Studio workflow state (spec "Concepts and data"): the allowed status
 * changes of weeks, slots and drafts, the studio-local calendar arithmetic the
 * week planning uses, and the `Actor` every owner mutation carries. Pure — no
 * database — so the services and their unit tests share one source of truth.
 */

/** Who performs an owner mutation (audited). Scheduled runs have no actor. */
export type Actor = { id: string; role: AccountRole };

export type StateKind = 'week' | 'slot' | 'draft';

const GRAPHS: Record<StateKind, Record<string, readonly string[]>> = {
  // proposing → proposals_ready → direction_set → titles_ready → validated (+ skipped).
  // titles_ready → direction_set: the owner picks another direction before validating.
  week: {
    proposing: ['proposals_ready', 'skipped'],
    proposals_ready: ['direction_set', 'skipped'],
    direction_set: ['titles_ready', 'skipped'],
    titles_ready: ['direction_set', 'validated', 'skipped'],
    validated: [],
    skipped: [],
  },
  // proposed → validated → drafting → drafted → done | skipped.
  // drafted → drafting: the day is generated again (late validation, retry).
  slot: {
    proposed: ['validated', 'skipped'],
    validated: ['drafting', 'skipped'],
    drafting: ['drafted', 'done', 'skipped'],
    drafted: ['drafting', 'done', 'skipped'],
    done: [],
    skipped: [],
  },
  // generating → ready → approved → published (+ failed, stale).
  // ready | approved → stale when the day's title changes; the owner then
  // regenerates (→ generating), edits (→ ready) or keeps and approves it.
  // An owner edit of an approved draft unpins it (→ ready); a failed draft
  // that still holds an earlier version can be edited back to ready.
  draft: {
    generating: ['ready', 'failed'],
    ready: ['approved', 'stale', 'generating'],
    approved: ['published', 'ready', 'stale', 'generating'],
    stale: ['generating', 'ready', 'approved'],
    failed: ['generating', 'ready'],
    published: [],
  },
};

export function canTransition(kind: StateKind, from: string, to: string): boolean {
  return GRAPHS[kind][from]?.includes(to) ?? false;
}

/** Every status of `kind` that may move to `to`. */
export function sourcesOf(kind: StateKind, to: string): string[] {
  return Object.keys(GRAPHS[kind]).filter((from) => canTransition(kind, from, to));
}

// ── Studio-local calendar (dates as `YYYY-MM-DD`, never UTC instants) ──

const DAY_MS = 86_400_000;
const utcOf = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);

/** `YYYY-MM-DD` of a `@db.Date` value. */
export const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

/** The `@db.Date` value of a calendar day. */
export const dateOf = (ymd: string) => new Date(utcOf(ymd));

export function addDaysYmd(ymd: string, n: number): string {
  return ymdOf(new Date(utcOf(ymd) + n * DAY_MS));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return new Date(utcOf(ymd)).getUTCDay();
}

/**
 * The week a launch on studio-local `today` (see `localDay`) plans: on a Sunday, next Monday's
 * full week; Monday–Saturday, the current week from tomorrow (a partial week).
 */
export function planWeek(today: string): { startsOn: string; firstDay: string } {
  const dow = weekdayOf(today);
  if (dow === 0) {
    const monday = addDaysYmd(today, 1);
    return { startsOn: monday, firstDay: monday };
  }
  return { startsOn: addDaysYmd(today, 1 - dow), firstDay: addDaysYmd(today, 1) };
}

/** Days planned in a week: `firstDay` … Sunday. */
export function daysInWeek(startsOn: string, firstDay: string): number {
  return 7 - Math.round((utcOf(firstDay) - utcOf(startsOn)) / DAY_MS);
}
