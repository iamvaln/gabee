import type {
  AiUsageResponse,
  AuditListResponse,
  AccountRole,
  DashboardResponse,
} from '@gabee/types';
import { prisma } from '../db';

/** AiUsageRow isn't exported as a named type; derive it from the response shape. */
type AiUsageRow = AiUsageResponse['rows'][number];

// Observability slice (admin spec §11.1 dashboard, §11.2 analytics, §11.3 ops,
// §4.4 audit). Everything here is read-only and derived from real tables. Where the
// data can't support a metric in dev (sparse telemetry), we return a safe 0/empty and
// document it inline rather than fabricate.

const DAY_MS = 86_400_000;
const sevenDaysAgo = () => new Date(Date.now() - 7 * DAY_MS);

/** A 5-star lesson/level completion is "mastery"; 7+ correct in a sitting maps to 5. */
const MASTERY_STARS = 4;

// ─── Dashboard (§11.1) ───────────────────────────────────────────────────────

export async function getDashboard(): Promise<DashboardResponse> {
  const since7 = sevenDaysAgo();
  const since28 = new Date(Date.now() - 28 * DAY_MS);

  const [
    registrations_7d,
    active_children_7d,
    sessions7Rows,
    classifications28,
    endEvents28,
    lessonEvents28,
    initiationCounts,
    masteryAgg,
  ] = await Promise.all([
    // Parent accounts created in the last 7 days.
    prisma.parentAccount.count({ where: { createdAt: { gte: since7 } } }),
    // Child profiles with activity in the last 7 days.
    prisma.childProfile.count({ where: { lastActiveAt: { gte: since7 } } }),
    // Distinct sessions seen in the last 7 days (events carry the session id).
    prisma.event.findMany({
      where: { serverTs: { gte: since7 }, sessionId: { not: null } },
      select: { sessionId: true },
      distinct: ['sessionId'],
    }),
    // Sessions started in the trailing 28 days — drive duration + active-days reads.
    prisma.sessionClassification.findMany({
      where: { startedAt: { gte: since28 } },
      select: { profileId: true, startedAt: true, durationS: true, sessionId: true, label: true },
    }),
    // session_end events in the window — a session that emitted one ended "naturally".
    prisma.event.findMany({
      where: { name: 'session_end', serverTs: { gte: since28 }, sessionId: { not: null } },
      select: { sessionId: true },
      distinct: ['sessionId'],
    }),
    // lesson_started events carry the volition trigger (new | retry | replay).
    prisma.event.findMany({
      where: { name: 'lesson_started', serverTs: { gte: since28 } },
      select: { payload: true },
    }),
    // Classified sessions by label — willingness/self-initiation share.
    prisma.sessionClassification.groupBy({
      by: ['label'],
      where: { label: { not: null }, startedAt: { gte: since28 } },
      _count: { _all: true },
    }),
    // Mastery: lesson/level completions and their star payloads.
    prisma.event.findMany({
      where: {
        name: { in: ['lesson_completed', 'level_completed'] },
        serverTs: { gte: since28 },
      },
      select: { payload: true },
    }),
  ]);

  const sessions_7d = sessions7Rows.length;

  // North star — weekly active learning days per child (median + 0..7 distribution).
  // "Active day" = a child has at least one session that calendar day.
  const daysByChild = new Map<string, Set<string>>();
  for (const c of classifications28) {
    // Only count the trailing 7 days for the per-week reading.
    if (c.startedAt < since7) continue;
    const dayKey = c.startedAt.toISOString().slice(0, 10);
    const set = daysByChild.get(c.profileId) ?? new Set<string>();
    set.add(dayKey);
    daysByChild.set(c.profileId, set);
  }
  const distribution = new Array<number>(8).fill(0); // buckets 0..7 active days
  const activeDayCounts: number[] = [];
  for (const set of daysByChild.values()) {
    const d = Math.min(7, set.size);
    distribution[d] = (distribution[d] ?? 0) + 1;
    activeDayCounts.push(d);
  }
  const median_active_days = median(activeDayCounts);

  // Engagement — median session length (s) + natural-end rate.
  const durations = classifications28
    .map((c) => c.durationS)
    .filter((d): d is number => typeof d === 'number' && d > 0);
  const median_session_s = median(durations);

  const sessionsWithDuration = classifications28.filter((c) => c.durationS != null).length;
  const endedSessions = endEvents28.length;
  const natural_end_rate =
    sessionsWithDuration > 0 ? clamp01(endedSessions / sessionsWithDuration) : 0;

  // Adherence — blended index of (a) in-app volition (share of lesson starts that are
  // continued play: retry/replay/position>1), (b) self-initiation share from
  // classifications, (c) parent willingness (share of sessions a parent classified).
  let volitionContinued = 0;
  for (const e of lessonEvents28) {
    const p = e.payload as { trigger?: string; position_in_session?: number } | null;
    if (p && (p.trigger === 'retry' || p.trigger === 'replay' || (p.position_in_session ?? 1) > 1)) {
      volitionContinued += 1;
    }
  }
  const volitionScore =
    lessonEvents28.length > 0 ? clamp01(volitionContinued / lessonEvents28.length) : 0;

  let classifiedTotal = 0;
  let selfInitiated = 0;
  for (const g of initiationCounts) {
    const n = g._count._all;
    classifiedTotal += n;
    if (g.label === 'child_initiated') selfInitiated += n;
  }
  const selfInitScore = classifiedTotal > 0 ? clamp01(selfInitiated / classifiedTotal) : 0;

  const totalSessions28 = classifications28.length;
  const parentWillingness =
    totalSessions28 > 0 ? clamp01(classifiedTotal / totalSessions28) : 0;

  // Average the components that actually have data; if none do, the index is 0.
  const components: number[] = [];
  if (lessonEvents28.length > 0) components.push(volitionScore);
  if (classifiedTotal > 0) components.push(selfInitScore);
  if (totalSessions28 > 0) components.push(parentWillingness);
  const adherenceIndex =
    components.length > 0 ? components.reduce((a, b) => a + b, 0) / components.length : 0;

  // 7-day sparkline of daily session counts (a light proxy for the adherence trend).
  const sparkline = dailySessionCounts(classifications28);

  // Learning — mastery rate = share of completions that hit the mastery star threshold.
  let masteryHits = 0;
  for (const e of masteryAgg) {
    const p = e.payload as { stars?: number } | null;
    if (p && typeof p.stars === 'number' && p.stars >= MASTERY_STARS) masteryHits += 1;
  }
  const mastery_rate =
    masteryAgg.length > 0 ? clamp01(masteryHits / masteryAgg.length) : 0;

  return {
    north_star: { median_active_days, distribution },
    adherence: { index: adherenceIndex, sparkline },
    engagement: { median_session_s, natural_end_rate },
    learning: { mastery_rate },
    operational: { registrations_7d, active_children_7d, sessions_7d },
  };
}

/** Count sessions per calendar day; return the last 7 daily buckets (oldest first). */
function dailySessionCounts(rows: { startedAt: Date }[]): number[] {
  const days = 7;
  const start = new Date(Date.now() - (days - 1) * DAY_MS);
  start.setHours(0, 0, 0, 0);
  const buckets = new Array<number>(days).fill(0);
  for (const r of rows) {
    if (r.startedAt < start) continue;
    const idx = Math.floor((r.startedAt.getTime() - start.getTime()) / DAY_MS);
    if (idx >= 0 && idx < days) buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}

// ─── AI usage (§11.3 · O1) ───────────────────────────────────────────────────

const AI_PURPOSES = new Set(['plan_generation', 'question_generation']);

/**
 * AI usage rolled up by (provider, model, purpose). Rows are written by the AI layer
 * (another agent, concurrent) and may be empty in dev — handled gracefully. Unknown
 * purpose strings are coerced to question_generation so the contract holds.
 */
export async function getAiUsage(): Promise<AiUsageResponse> {
  const grouped = await prisma.aiUsage.groupBy({
    by: ['provider', 'model', 'purpose'],
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true, costUsd: true },
  });

  const rows: AiUsageRow[] = grouped.map((g) => ({
    provider: g.provider,
    model: g.model,
    purpose: AI_PURPOSES.has(g.purpose)
      ? (g.purpose as AiUsageRow['purpose'])
      : 'question_generation',
    calls: g._count._all,
    input_tokens: g._sum.inputTokens ?? 0,
    output_tokens: g._sum.outputTokens ?? 0,
    cost_usd: g._sum.costUsd ?? 0,
  }));

  rows.sort((a, b) => b.cost_usd - a.cost_usd || b.calls - a.calls);

  const total_cost_usd = rows.reduce((s, r) => s + r.cost_usd, 0);
  const total_calls = rows.reduce((s, r) => s + r.calls, 0);

  return { rows, total_cost_usd, total_calls };
}

// ─── Audit log (§4.4 · O3) ───────────────────────────────────────────────────

export const AUDIT_PAGE_SIZE = 50;

export interface AuditFilters {
  /** Free-text search over `kind` and `target_id` (case-insensitive substring). */
  q?: string;
  /** Exact `kind` filter (e.g. `pool.confirm`). */
  kind?: string;
  /** Substring match on the actor's email (resolved live via a join). */
  actor?: string;
  /** ISO date `YYYY-MM-DD` — inclusive lower bound. */
  from?: string;
  /** ISO date `YYYY-MM-DD` — exclusive upper bound (next day at 00:00). */
  to?: string;
  /** 1-indexed page. */
  page?: number;
  pageSize?: number;
}

export interface AuditListPage extends AuditListResponse {
  total: number;
  page: number;
  page_size: number;
  /** Distinct `kind` values across the WHOLE log — feeds the filter dropdown. */
  available_kinds: string[];
}

/**
 * Filtered + paginated audit entries (admin spec §4.4 / O3). `q` matches kind +
 * target_id; `actor` matches the resolved email substring (the audit table only
 * stores actor_id, so we resolve email → id-set first then filter).
 */
export async function getAuditLog(filters: AuditFilters = {}): Promise<AuditListPage> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? AUDIT_PAGE_SIZE));

  // Resolve the `actor` substring to a set of actor ids the audit query can use.
  let actorIdsFilter: string[] | undefined;
  if (filters.actor && filters.actor.trim()) {
    const matches = await prisma.parentAccount.findMany({
      where: { email: { contains: filters.actor.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    actorIdsFilter = matches.map((a) => a.id);
    // If no email matched, short-circuit to an empty result.
    if (actorIdsFilter.length === 0) {
      const distinctKinds = await prisma.auditLog.findMany({
        distinct: ['kind'],
        select: { kind: true },
        orderBy: { kind: 'asc' },
      });
      return {
        entries: [],
        total: 0,
        page,
        page_size: pageSize,
        available_kinds: distinctKinds.map((d) => d.kind),
      };
    }
  }

  const fromDate = filters.from ? new Date(filters.from + 'T00:00:00.000Z') : undefined;
  // `to` is inclusive (the calendar day), so add 24h for the strict-less-than bound.
  const toDate = filters.to
    ? new Date(new Date(filters.to + 'T00:00:00.000Z').getTime() + 24 * 60 * 60 * 1000)
    : undefined;

  const where = {
    ...(actorIdsFilter ? { actorId: { in: actorIdsFilter } } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.q && filters.q.trim()
      ? {
          OR: [
            { kind: { contains: filters.q.trim(), mode: 'insensitive' as const } },
            { targetId: { contains: filters.q.trim(), mode: 'insensitive' as const } },
            { targetKind: { contains: filters.q.trim(), mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lt: toDate } : {}),
          },
        }
      : {}),
  };

  const [rows, total, distinctKinds] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        actorId: true,
        actorRole: true,
        kind: true,
        targetKind: true,
        targetId: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ['kind'],
      select: { kind: true },
      orderBy: { kind: 'asc' },
    }),
  ]);

  return {
    entries: rows.map((r) => ({
      id: r.id,
      actor_id: r.actorId,
      actor_role: r.actorRole as AccountRole,
      kind: r.kind,
      target_kind: r.targetKind,
      target_id: r.targetId,
      created_at: r.createdAt.toISOString(),
    })),
    total,
    page,
    page_size: pageSize,
    available_kinds: distinctKinds.map((d) => d.kind),
  };
}

/** Resolve actor ids → emails for display (audit rows store only the id). */
export async function resolveActorEmails(
  actorIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(actorIds)];
  if (ids.length === 0) return new Map();
  const accounts = await prisma.parentAccount.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true },
  });
  return new Map(accounts.map((a) => [a.id, a.email]));
}

// ─── Analytics deep-dives (§11.2) ────────────────────────────────────────────

export interface ModuleEngagement {
  module: string;
  sessions: number;
  median_session_s: number;
  completions: number;
  mastery_rate: number;
  avg_correct_rate: number;
}

export interface SessionInitiationBreakdown {
  child_initiated: number;
  prompted: number;
  unsure: number;
  unclassified: number;
}

export interface RetentionFunnel {
  launched: number;
  first_session: number;
  returned_2d: number;
  returned_7d: number;
}

export interface AnalyticsData {
  modules: ModuleEngagement[];
  initiation: SessionInitiationBreakdown;
  funnel: RetentionFunnel;
  total_sessions: number;
  classified_sessions: number;
}

export async function getAnalytics(): Promise<AnalyticsData> {
  const since28 = new Date(Date.now() - 28 * DAY_MS);

  const [
    classifications,
    completionEvents,
    answerEvents,
    typingEvents,
    codeRunEvents,
    initiationGroups,
    profiles,
    launchEvents,
  ] = await Promise.all([
      prisma.sessionClassification.findMany({
        where: { startedAt: { gte: since28 } },
        select: { firstModule: true, durationS: true, profileId: true, startedAt: true, label: true },
      }),
      prisma.event.findMany({
        where: {
          name: { in: ['lesson_completed', 'level_completed'] },
          serverTs: { gte: since28 },
        },
        select: { payload: true },
      }),
      prisma.event.findMany({
        where: { name: 'question_answered', serverTs: { gte: since28 } },
        select: { payload: true },
      }),
      // Keyboard module: a typed word with zero errors counts as "correct".
      // Maps the process-rich `typing_word_completed` event onto the same
      // accuracy axis as question_answered so the per-module engagement table
      // can render a real number for keyboard.
      prisma.event.findMany({
        where: { name: 'typing_word_completed', serverTs: { gte: since28 } },
        select: { payload: true },
      }),
      // Code module: a `code_run` whose `result === 'success'` counts as
      // correct. Each run is an attempt — failures (hit_wall, wrong_position)
      // are tracked as not-correct, which matches kid effort over time.
      prisma.event.findMany({
        where: { name: 'code_run', serverTs: { gte: since28 } },
        select: { payload: true },
      }),
      prisma.sessionClassification.groupBy({
        by: ['label'],
        where: { startedAt: { gte: since28 } },
        _count: { _all: true },
      }),
      prisma.childProfile.count(),
      prisma.event.findMany({
        where: { name: 'app_launched', serverTs: { gte: since28 } },
        select: { profileId: true },
        distinct: ['profileId'],
      }),
    ]);

  // Per-module engagement: sessions whose first module is X, plus completion/correct
  // stats bucketed by module from the event payloads.
  const moduleSessions = new Map<string, number>();
  const moduleDurations = new Map<string, number[]>();
  for (const c of classifications) {
    if (!c.firstModule) continue;
    moduleSessions.set(c.firstModule, (moduleSessions.get(c.firstModule) ?? 0) + 1);
    if (c.durationS != null && c.durationS > 0) {
      const arr = moduleDurations.get(c.firstModule) ?? [];
      arr.push(c.durationS);
      moduleDurations.set(c.firstModule, arr);
    }
  }

  const moduleCompletions = new Map<string, number>();
  const moduleMastery = new Map<string, number>();
  for (const e of completionEvents) {
    const p = e.payload as { module?: string; stars?: number } | null;
    if (!p?.module) continue;
    moduleCompletions.set(p.module, (moduleCompletions.get(p.module) ?? 0) + 1);
    if (typeof p.stars === 'number' && p.stars >= MASTERY_STARS) {
      moduleMastery.set(p.module, (moduleMastery.get(p.module) ?? 0) + 1);
    }
  }

  const moduleCorrect = new Map<string, { correct: number; total: number }>();
  for (const e of answerEvents) {
    const p = e.payload as { module?: string; correct?: boolean } | null;
    if (!p?.module) continue;
    const agg = moduleCorrect.get(p.module) ?? { correct: 0, total: 0 };
    agg.total += 1;
    if (p.correct) agg.correct += 1;
    moduleCorrect.set(p.module, agg);
  }
  // Keyboard: zero-error typed word = "correct". Module not on the event
  // payload (the spec embeds it implicitly via the event name), so we hard-
  // code 'keyboard' here.
  for (const e of typingEvents) {
    const p = e.payload as { error_count?: number } | null;
    if (p == null) continue;
    const agg = moduleCorrect.get('keyboard') ?? { correct: 0, total: 0 };
    agg.total += 1;
    if ((p.error_count ?? 0) === 0) agg.correct += 1;
    moduleCorrect.set('keyboard', agg);
  }
  // Code: a run with result==='success' = "correct"; hit_wall / wrong_position
  // count as not correct (kid will retry, that's the engagement loop).
  for (const e of codeRunEvents) {
    const p = e.payload as { result?: string } | null;
    if (p == null) continue;
    const agg = moduleCorrect.get('code') ?? { correct: 0, total: 0 };
    agg.total += 1;
    if (p.result === 'success') agg.correct += 1;
    moduleCorrect.set('code', agg);
  }

  const moduleIds = ['numbers', 'words', 'keyboard', 'code', 'translation'];
  const modules: ModuleEngagement[] = moduleIds.map((id) => {
    const completions = moduleCompletions.get(id) ?? 0;
    const mastery = moduleMastery.get(id) ?? 0;
    const correct = moduleCorrect.get(id);
    return {
      module: id,
      sessions: moduleSessions.get(id) ?? 0,
      median_session_s: median(moduleDurations.get(id) ?? []),
      completions,
      mastery_rate: completions > 0 ? clamp01(mastery / completions) : 0,
      avg_correct_rate: correct && correct.total > 0 ? clamp01(correct.correct / correct.total) : 0,
    };
  });

  // Session-initiation breakdown from classifications.
  const initiation: SessionInitiationBreakdown = {
    child_initiated: 0,
    prompted: 0,
    unsure: 0,
    unclassified: 0,
  };
  for (const g of initiationGroups) {
    const n = g._count._all;
    if (g.label === 'child_initiated') initiation.child_initiated = n;
    else if (g.label === 'prompted') initiation.prompted = n;
    else if (g.label === 'unsure') initiation.unsure = n;
    else initiation.unclassified += n;
  }
  const classified_sessions =
    initiation.child_initiated + initiation.prompted + initiation.unsure;
  const total_sessions = classifications.length;

  // Retention funnel: launched (profiles seen) → first session → returned on a 2nd
  // distinct day → returned within a 7-day window. Built from session day sets.
  const dayByChild = new Map<string, Set<string>>();
  for (const c of classifications) {
    const set = dayByChild.get(c.profileId) ?? new Set<string>();
    set.add(c.startedAt.toISOString().slice(0, 10));
    dayByChild.set(c.profileId, set);
  }
  let firstSession = 0;
  let returned2d = 0;
  let returned7d = 0;
  const since7 = sevenDaysAgo().toISOString().slice(0, 10);
  for (const set of dayByChild.values()) {
    if (set.size >= 1) firstSession += 1;
    if (set.size >= 2) returned2d += 1;
    if ([...set].some((d) => d >= since7)) returned7d += 1;
  }
  const launched = Math.max(profiles, launchEvents.length, firstSession);

  return {
    modules,
    initiation,
    funnel: {
      launched,
      first_session: firstSession,
      returned_2d: returned2d,
      returned_7d: returned7d,
    },
    total_sessions,
    classified_sessions,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
