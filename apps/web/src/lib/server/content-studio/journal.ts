import { prisma } from '../db';
import { getStudioTimezone } from '../services/web-visits';
import { SENDING_STALE_MS } from './notify';
import { ymdOf } from './state';

/**
 * The Journal screen: what the scheduler and the agents did lately, so the
 * owner can see a failed or abandoned run, its full error and what it cost.
 * Read-only; costs come from the `ai_usage` rows linked to each agent run.
 */

export const JOURNAL_LIMIT = 50;

export type JobRunEntry = {
  id: string;
  job_key: string;
  /** `week:YYYY-MM-DD[@HH]`, `day:YYYY-MM-DD[@HH]` or `hour:YYYY-MM-DDTHH` (studio-local). */
  period_key: string;
  /** running | waiting | succeeded | failed (will retry) | abandoned (gave up). */
  status: string;
  /** Failed attempts so far. */
  attempts: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  /** null while it runs. */
  duration_ms: number | null;
  next_attempt_at: string | null;
  /**
   * Abandoned jobs only: did the "job failed" email leave? `sent` (to at least
   * one recipient), `sending` (still being sent, none sent yet), `failed`
   * (every attempt failed, or a send that crashed mid-way), `none` (no email
   * recorded). null for any other status.
   */
  alert: AlertStatus | null;
};

export type AlertStatus = 'sent' | 'sending' | 'failed' | 'none';

export type AgentRunEntry = {
  id: string;
  agent_key: string;
  origin: string;
  /** What the run worked on, named for the screen (day, platform, topic) when it still exists. */
  subject: { kind: string; id: string; date: string | null; platform: string | null; topic: string | null };
  /** running | succeeded | failed | invalid_output. */
  status: string;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  /** Sum of the run's AI calls (failed and invalid attempts included), USD. */
  cost_usd: number;
  ai_calls: number;
};

export type StudioJournal = { timezone: string; jobs: JobRunEntry[]; agents: AgentRunEntry[] };

const WEEK_SUBJECTS = new Set(['week_proposals', 'week_titles', 'week_report']);

const durationOf = (start: Date, end: Date | null) => (end ? Math.max(0, end.getTime() - start.getTime()) : null);
const roundUsd = (n: number) => Math.round(n * 1e6) / 1e6;

export async function studioJournal(limit = JOURNAL_LIMIT): Promise<StudioJournal> {
  const [timezone, jobs, runs] = await Promise.all([
    getStudioTimezone(),
    prisma.jobRun.findMany({
      // The hourly budget check runs 24 times a day; a successful one says nothing and would bury the rest.
      where: { NOT: { jobKey: 'budget.check', status: 'succeeded' } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
    prisma.agentRun.findMany({
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        agentKey: true,
        origin: true,
        subjectKind: true,
        subjectId: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        latencyMs: true,
        startedAt: true,
        finishedAt: true,
      },
    }),
  ]);

  // The abandon alert is notifyOnce('job.failed', `${jobKey}|${periodKey}`) (jobs.ts).
  const alertKeys = jobs.filter((j) => j.status === 'abandoned').map((j) => `${j.jobKey}|${j.periodKey}`);
  const alerts = alertKeys.length
    ? await prisma.studioNotification.findMany({
        where: { kind: 'job.failed', periodKey: { in: alertKeys } },
        select: { periodKey: true, status: true, updatedAt: true },
      })
    : [];
  // A `sending` row is in flight only while fresh: past the takeover window its tick crashed (notify.ts).
  const sendingSince = Date.now() - SENDING_STALE_MS;
  const alertOf = (key: string): AlertStatus => {
    const rows = alerts.filter((a) => a.periodKey === key);
    if (rows.some((a) => a.status === 'sent')) return 'sent';
    if (rows.some((a) => a.status === 'sending' && a.updatedAt.getTime() >= sendingSince)) return 'sending';
    return rows.length ? 'failed' : 'none';
  };

  const runIds = runs.map((r) => r.id);
  const draftIds = runs.filter((r) => r.subjectKind === 'draft').map((r) => r.subjectId);
  const weekIds = runs.filter((r) => WEEK_SUBJECTS.has(r.subjectKind)).map((r) => r.subjectId);
  const [costs, drafts, weeks] = await Promise.all([
    runIds.length
      ? prisma.aiUsage.groupBy({ by: ['agentRunId'], where: { agentRunId: { in: runIds } }, _sum: { costUsd: true }, _count: { _all: true } })
      : Promise.resolve([]),
    draftIds.length
      ? prisma.contentDraft.findMany({ where: { id: { in: draftIds } }, select: { id: true, platform: true, slot: { select: { date: true, topic: true } } } })
      : Promise.resolve([]),
    weekIds.length ? prisma.contentWeek.findMany({ where: { id: { in: weekIds } }, select: { id: true, startsOn: true } }) : Promise.resolve([]),
  ]);
  const costOf = new Map(costs.map((c) => [c.agentRunId, { usd: roundUsd(c._sum.costUsd ?? 0), calls: c._count._all }]));
  const draftOf = new Map(drafts.map((d) => [d.id, d]));
  const weekOf = new Map(weeks.map((w) => [w.id, w]));

  return {
    timezone,
    jobs: jobs.map((j) => ({
      id: j.id,
      job_key: j.jobKey,
      period_key: j.periodKey,
      status: j.status,
      attempts: j.attempts,
      error: j.error,
      started_at: j.startedAt.toISOString(),
      finished_at: j.finishedAt?.toISOString() ?? null,
      duration_ms: j.status === 'running' ? null : durationOf(j.startedAt, j.finishedAt),
      next_attempt_at: j.nextAttemptAt?.toISOString() ?? null,
      alert: j.status === 'abandoned' ? alertOf(`${j.jobKey}|${j.periodKey}`) : null,
    })),
    agents: runs.map((r) => {
      const draft = r.subjectKind === 'draft' ? draftOf.get(r.subjectId) : undefined;
      const week = WEEK_SUBJECTS.has(r.subjectKind) ? weekOf.get(r.subjectId) : undefined;
      const cost = costOf.get(r.id);
      return {
        id: r.id,
        agent_key: r.agentKey,
        origin: r.origin,
        subject: {
          kind: r.subjectKind,
          id: r.subjectId,
          date: draft ? ymdOf(draft.slot.date) : week ? ymdOf(week.startsOn) : null,
          platform: draft?.platform ?? null,
          topic: draft?.slot.topic ?? null,
        },
        status: r.status,
        error_code: r.errorCode,
        error_message: r.errorMessage,
        started_at: r.startedAt.toISOString(),
        finished_at: r.finishedAt?.toISOString() ?? null,
        duration_ms: r.latencyMs ?? (r.status === 'running' ? null : durationOf(r.startedAt, r.finishedAt)),
        cost_usd: cost?.usd ?? 0,
        ai_calls: cost?.calls ?? 0,
      };
    }),
  };
}
