import { prisma } from '../db';

// ─── Parent activation funnel ───────────────────────────────────────────────
//
// 6-step funnel from signup to activation, derived from milestone columns on
// ParentAccount (firstLoginAt / firstKidAddedAt / firstClassificationAt /
// firstMessageSentAt + the pre-existing emailConfirmedAt). The columns are
// flipped null→now() at the relevant API endpoints; a backfill is intentional
// NOT performed for pre-migration parents — the cohort baseline starts on
// the day the migration shipped, so historic rows look like they "stalled at
// signup" until they next perform each action.

export interface FunnelStep {
  key: string;
  label_fr: string;
  label_en: string;
  count: number;
  /** 0-1 — share of the baseline (signups for parent, kids in cohort for kid). */
  pct_of_baseline: number;
  /** 0-1 — share of the step before this one. Captures the step-to-step
   *  drop. For the baseline step itself this equals 1. */
  pct_of_previous: number;
}

export interface ParentFunnel {
  window_days: number;
  baseline: number;
  steps: FunnelStep[];
}

const PARENT_STEP_KEYS = [
  { key: 'signup', label_fr: 'Inscription', label_en: 'Signup' },
  { key: 'email_confirmed', label_fr: 'Email confirmé', label_en: 'Email confirmed' },
  { key: 'first_login', label_fr: 'Premier login', label_en: 'First login' },
  { key: 'first_kid', label_fr: 'Premier enfant', label_en: 'First kid added' },
  { key: 'first_classification', label_fr: 'Première classification', label_en: 'First classification' },
  { key: 'first_message', label_fr: 'Premier message', label_en: 'First message' },
] as const;

export async function getParentFunnel(windowDays = 28): Promise<ParentFunnel> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = await prisma.parentAccount.findMany({
    where: { createdAt: { gte: since } },
    select: {
      emailConfirmedAt: true,
      firstLoginAt: true,
      firstKidAddedAt: true,
      firstClassificationAt: true,
      firstMessageSentAt: true,
    },
  });
  const baseline = rows.length;
  const counts: Record<string, number> = {
    signup: baseline,
    email_confirmed: rows.filter((r) => r.emailConfirmedAt != null).length,
    first_login: rows.filter((r) => r.firstLoginAt != null).length,
    first_kid: rows.filter((r) => r.firstKidAddedAt != null).length,
    first_classification: rows.filter((r) => r.firstClassificationAt != null).length,
    first_message: rows.filter((r) => r.firstMessageSentAt != null).length,
  };
  return {
    window_days: windowDays,
    baseline,
    steps: PARENT_STEP_KEYS.map((s, i) => {
      const count = counts[s.key] ?? 0;
      const prev = i === 0 ? baseline : counts[PARENT_STEP_KEYS[i - 1]!.key] ?? 0;
      return {
        ...s,
        count,
        pct_of_baseline: baseline === 0 ? 0 : count / baseline,
        pct_of_previous: prev === 0 ? 0 : count / prev,
      };
    }),
  };
}

// ─── Parent weekly cohorts ──────────────────────────────────────────────────
//
// Bucket parents by the ISO week of their createdAt (Mon-start, per the
// Postgres date_trunc('week', …) convention which aligns with ISO 8601).
// For each bucket, the row reports signups + how many of those parents ever
// reached each downstream milestone. The retention matrix view stacks
// matrix[cohort][milestone] = count.

export interface ParentCohortRow {
  /** "2026-W23" — ISO year-week. */
  week_iso: string;
  /** Monday of the cohort week, YYYY-MM-DD. */
  week_start: string;
  signups: number;
  email_confirmed: number;
  first_login: number;
  first_kid: number;
  first_classification: number;
  first_message: number;
}

export async function getParentCohorts(weeksBack = 12): Promise<ParentCohortRow[]> {
  const since = new Date(Date.now() - weeksBack * 7 * 86_400_000);
  // Postgres `date_trunc('week', col)` snaps to the Monday of the week,
  // which is the ISO 8601 convention. We project the bucket as a date so
  // the JS layer can format it without timezone slippage.
  const rows = await prisma.$queryRaw<
    {
      week_start: Date;
      signups: bigint;
      email_confirmed: bigint;
      first_login: bigint;
      first_kid: bigint;
      first_classification: bigint;
      first_message: bigint;
    }[]
  >`
    SELECT
      date_trunc('week', "created_at")::date AS week_start,
      COUNT(*)::bigint AS signups,
      COUNT("email_confirmed_at")::bigint AS email_confirmed,
      COUNT("first_login_at")::bigint AS first_login,
      COUNT("first_kid_added_at")::bigint AS first_kid,
      COUNT("first_classification_at")::bigint AS first_classification,
      COUNT("first_message_sent_at")::bigint AS first_message
    FROM "parent_accounts"
    WHERE "created_at" >= ${since}
    GROUP BY date_trunc('week', "created_at")
    ORDER BY week_start ASC
  `;
  return rows.map((r) => ({
    week_iso: isoWeekKey(r.week_start),
    week_start: r.week_start.toISOString().slice(0, 10),
    signups: Number(r.signups),
    email_confirmed: Number(r.email_confirmed),
    first_login: Number(r.first_login),
    first_kid: Number(r.first_kid),
    first_classification: Number(r.first_classification),
    first_message: Number(r.first_message),
  }));
}

// ─── Kid engagement funnel ──────────────────────────────────────────────────
//
// Derived from the `events` table because there's no milestone column on
// ChildProfile yet. Each step is a yes/no: did this kid emit ≥1 event of
// this name? Plus the "active 7d" probe which fires when ≥1 event of any
// kind landed within the last 7 days.

export interface KidFunnel {
  window_days: number;
  baseline: number;
  steps: FunnelStep[];
}

const KID_STEP_KEYS = [
  { key: 'created', label_fr: 'Profil créé', label_en: 'Profile created' },
  { key: 'launched', label_fr: 'Premier lancement', label_en: 'First launch' },
  { key: 'lesson_done', label_fr: 'Première leçon', label_en: 'First lesson done' },
  { key: 'level_done', label_fr: 'Premier niveau', label_en: 'First level done' },
  { key: 'active_7d', label_fr: 'Actif (7 j)', label_en: 'Active in last 7d' },
] as const;

export async function getKidFunnel(windowDays = 28): Promise<KidFunnel> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const sevenAgo = new Date(Date.now() - 7 * 86_400_000);

  // Single SQL: every kid created in the window with a flag per milestone
  // computed via EXISTS subqueries on the events table. EXISTS short-
  // circuits at the first matching row so the per-kid cost is bounded.
  const rows = await prisma.$queryRaw<
    {
      id: string;
      launched: boolean;
      lesson_done: boolean;
      level_done: boolean;
      active_7d: boolean;
    }[]
  >`
    SELECT
      cp.id,
      EXISTS (SELECT 1 FROM events e WHERE e.profile_id = cp.id AND e.name = 'app_launched') AS launched,
      EXISTS (SELECT 1 FROM events e WHERE e.profile_id = cp.id AND e.name = 'lesson_completed') AS lesson_done,
      EXISTS (SELECT 1 FROM events e WHERE e.profile_id = cp.id AND e.name = 'level_completed') AS level_done,
      EXISTS (SELECT 1 FROM events e WHERE e.profile_id = cp.id AND e.server_ts >= ${sevenAgo}) AS active_7d
    FROM child_profiles cp
    WHERE cp.created_at >= ${since}
  `;

  const baseline = rows.length;
  const counts: Record<string, number> = {
    created: baseline,
    launched: rows.filter((r) => r.launched).length,
    lesson_done: rows.filter((r) => r.lesson_done).length,
    level_done: rows.filter((r) => r.level_done).length,
    active_7d: rows.filter((r) => r.active_7d).length,
  };
  return {
    window_days: windowDays,
    baseline,
    steps: KID_STEP_KEYS.map((s, i) => {
      const count = counts[s.key] ?? 0;
      const prev = i === 0 ? baseline : counts[KID_STEP_KEYS[i - 1]!.key] ?? 0;
      return {
        ...s,
        count,
        pct_of_baseline: baseline === 0 ? 0 : count / baseline,
        pct_of_previous: prev === 0 ? 0 : count / prev,
      };
    }),
  };
}

// ─── Kid weekly cohorts ─────────────────────────────────────────────────────

export interface KidCohortRow {
  week_iso: string;
  week_start: string;
  created: number;
  launched: number;
  lesson_done: number;
  level_done: number;
  active_7d: number;
}

export async function getKidCohorts(weeksBack = 12): Promise<KidCohortRow[]> {
  const since = new Date(Date.now() - weeksBack * 7 * 86_400_000);
  const sevenAgo = new Date(Date.now() - 7 * 86_400_000);
  const rows = await prisma.$queryRaw<
    {
      week_start: Date;
      created: bigint;
      launched: bigint;
      lesson_done: bigint;
      level_done: bigint;
      active_7d: bigint;
    }[]
  >`
    SELECT
      date_trunc('week', cp.created_at)::date AS week_start,
      COUNT(*)::bigint AS created,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM events e WHERE e.profile_id = cp.id AND e.name = 'app_launched'
      ))::bigint AS launched,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM events e WHERE e.profile_id = cp.id AND e.name = 'lesson_completed'
      ))::bigint AS lesson_done,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM events e WHERE e.profile_id = cp.id AND e.name = 'level_completed'
      ))::bigint AS level_done,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM events e WHERE e.profile_id = cp.id AND e.server_ts >= ${sevenAgo}
      ))::bigint AS active_7d
    FROM child_profiles cp
    WHERE cp.created_at >= ${since}
    GROUP BY date_trunc('week', cp.created_at)
    ORDER BY week_start ASC
  `;
  return rows.map((r) => ({
    week_iso: isoWeekKey(r.week_start),
    week_start: r.week_start.toISOString().slice(0, 10),
    created: Number(r.created),
    launched: Number(r.launched),
    lesson_done: Number(r.lesson_done),
    level_done: Number(r.level_done),
    active_7d: Number(r.active_7d),
  }));
}

// ─── Drop-off lists (operational signal) ────────────────────────────────────
//
// For each funnel step, surface the parents who CROSSED the previous step
// but didn't reach this one within `idleDays`. Admins can use these lists
// for retargeting outreach (e.g. resend confirmation, nudge to add a kid).
//
// We only expose parent drop-off for now — kid drop-off is derivative of
// the kid's parent's activity and rarely actionable on its own.

export interface DropOffParent {
  parent_id: string;
  email: string;
  signed_up_at: string;
  days_since_signup: number;
  /** The last milestone they hit (`'signup'` if none). */
  last_milestone: string;
}

const PARENT_MILESTONE_COLS = [
  { key: 'email_confirmed', col: 'emailConfirmedAt' },
  { key: 'first_login', col: 'firstLoginAt' },
  { key: 'first_kid', col: 'firstKidAddedAt' },
  { key: 'first_classification', col: 'firstClassificationAt' },
  { key: 'first_message', col: 'firstMessageSentAt' },
] as const;

export async function getParentDropOff(
  step: (typeof PARENT_MILESTONE_COLS)[number]['key'],
  idleDays = 3,
  limit = 50,
): Promise<DropOffParent[]> {
  const cutoff = new Date(Date.now() - idleDays * 86_400_000);
  const target = PARENT_MILESTONE_COLS.find((m) => m.key === step);
  if (!target) return [];
  const stepIdx = PARENT_MILESTONE_COLS.findIndex((m) => m.key === step);
  const prevCol = stepIdx === 0 ? null : PARENT_MILESTONE_COLS[stepIdx - 1]!.col;

  // "Crossed previous" = the previous milestone is non-null, OR there is
  // no previous milestone (drop-off after signup). Plus signed-up before
  // the idle cutoff and the current milestone is still null.
  const rows = await prisma.parentAccount.findMany({
    where: {
      createdAt: { lte: cutoff },
      ...(prevCol ? { [prevCol]: { not: null } } : {}),
      [target.col]: null,
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
      emailConfirmedAt: true,
      firstLoginAt: true,
      firstKidAddedAt: true,
      firstClassificationAt: true,
      firstMessageSentAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  const now = Date.now();
  return rows.map((r) => {
    const last = lastReachedParentMilestone(r);
    return {
      parent_id: r.id,
      email: r.email,
      signed_up_at: r.createdAt.toISOString(),
      days_since_signup: Math.floor((now - r.createdAt.getTime()) / 86_400_000),
      last_milestone: last,
    };
  });
}

function lastReachedParentMilestone(r: {
  emailConfirmedAt: Date | null;
  firstLoginAt: Date | null;
  firstKidAddedAt: Date | null;
  firstClassificationAt: Date | null;
  firstMessageSentAt: Date | null;
}): string {
  if (r.firstMessageSentAt) return 'first_message';
  if (r.firstClassificationAt) return 'first_classification';
  if (r.firstKidAddedAt) return 'first_kid';
  if (r.firstLoginAt) return 'first_login';
  if (r.emailConfirmedAt) return 'email_confirmed';
  return 'signup';
}

// ─── ISO week formatter ─────────────────────────────────────────────────────

function isoWeekKey(date: Date): string {
  // Standard ISO 8601 week number: Thursday of the week determines the year.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
