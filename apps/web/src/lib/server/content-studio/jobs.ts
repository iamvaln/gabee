import { Prisma } from '@gabee/db';
import type { ReportNarrative } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { reportError } from '../report-error';
import { AiInvalidOutputError, AiRefusedError, AiUnavailableError } from '../ai/router';
import { getAudience, getStudioTimezone } from '../services/web-visits';
import { runAgent } from './agents';
import { checkBudget } from './budget';
import { zonedTime } from './clock';
import { enabledPlatforms, generateDraftsForDay, parseSlotPlatforms, todayBoard } from './drafts';
import { dailyDraftsEmail, dayReminderEmail, jobFailedEmail, summariseAudience, weekProposalsEmail, weekReminderEmail } from './emails';
import { notifyOnce, pendingCounts, ReportedUpstreamError, requireDelivered, studioLink, type Sender } from './notify';
import { dueJobs, type DueJob, type JobKey } from './schedule';
import { addDaysYmd, dateOf, ymdOf } from './state';
import { getWeek, proposeDirections, startWeek } from './weeks';

/**
 * The 10-minute tick (spec "Scheduling"): for the studio-local time, run each
 * due job at most once per period key. A `JobRun` row (unique per job and
 * period) is claimed before the handler runs, so overlapping ticks never run
 * a job twice.
 *
 * Jobs are "not consumed until meaningful" (Ruling 11): a handler that cannot
 * act yet (the week is not validated, the drafts are not written…) answers
 * `waiting`; its row is released without counting an attempt and the next
 * tick runs it again, until its window closes (`dueJobs`). So a week
 * validated late on Monday gets its drafts within one tick and the
 * notification right after them.
 *
 * A handler that throws marks the row `failed` with `attempts + 1` and a
 * backoff (`2^attempts × 5 min`, at most 60 min); it is retried while still
 * due. The 4th failure is terminal (Ruling 12, cost): the row becomes
 * `abandoned` — never claimed again, no further paid retry — the owner is
 * emailed and the error is reported to Sentry, once each (unless it was
 * reported where it happened). The owner retries from the admin.
 */

export type JobRunStatus = 'succeeded' | 'waiting' | 'failed' | 'abandoned';
export type TickSummary = {
  /** Jobs this tick claimed and ran; `error` = the job's bookkeeping itself failed (reported). */
  ran: { jobKey: JobKey; periodKey: string; status: JobRunStatus | 'error' }[];
  /** Due jobs left alone: already succeeded or abandoned, running elsewhere, or backing off. */
  skipped: number;
};

type Outcome = 'done' | 'waiting';
type Ctx = { now: Date; tz: string; send: Sender | undefined };
type Handler = (job: DueJob, ctx: Ctx) => Promise<Outcome>;

/**
 * A `running` row older than this belongs to a crashed tick and may be taken
 * over (Ruling 18: longer than a draft's 20-minute generation lock, so a slow
 * live run is never doubled).
 */
const RUNNING_STALE_MS = 25 * 60_000;
const BACKOFF_BASE_MS = 5 * 60_000;
const BACKOFF_CAP_MS = 60 * 60_000;
/** A job gets at most this many attempts per period, then is `abandoned` and the owner alerted. */
const MAX_ATTEMPTS = 4;

const REPORT_UNAVAILABLE: ReportNarrative = { headline: "Le bilan n'a pas pu être rédigé cette fois.", highlights: [], watch_outs: [] };

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** `week:2026-10-26@15` → `2026-10-26`; `day:2026-10-28@09` → `2026-10-28`. */
const periodDate = (periodKey: string) => periodKey.slice(periodKey.indexOf(':') + 1, periodKey.indexOf(':') + 11);

// ── Claiming ──

/** Take the right to run the job for its period; null when it is done, running elsewhere or backing off. */
async function claim(job: DueJob, now: Date): Promise<{ attempts: number } | null> {
  const key = { jobKey: job.jobKey, periodKey: job.periodKey };
  try {
    await prisma.jobRun.create({ data: { ...key, status: 'running', startedAt: now } });
    return { attempts: 0 };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
  // Conditional takeover: two ticks racing on the same row cannot both match.
  const taken = await prisma.jobRun.updateMany({
    where: {
      ...key,
      OR: [
        { status: 'waiting' },
        { status: 'failed', nextAttemptAt: { lte: now } },
        { status: 'running', startedAt: { lt: new Date(now.getTime() - RUNNING_STALE_MS) } },
      ],
    },
    data: { status: 'running', startedAt: now, finishedAt: null },
  });
  if (taken.count !== 1) return null;
  const row = await prisma.jobRun.findUniqueOrThrow({ where: { jobKey_periodKey: key }, select: { attempts: true } });
  return { attempts: row.attempts };
}

/** Record a failed attempt: `failed` with a backoff, or `abandoned` (terminal) at the last attempt. */
async function recordFailure(job: DueJob, ctx: Ctx, attemptsBefore: number, err: unknown): Promise<'failed' | 'abandoned'> {
  const attempts = attemptsBefore + 1;
  const error = messageOf(err);
  const where = { jobKey_periodKey: { jobKey: job.jobKey, periodKey: job.periodKey } };
  if (attempts < MAX_ATTEMPTS) {
    const delay = Math.min(2 ** attempts * BACKOFF_BASE_MS, BACKOFF_CAP_MS);
    await prisma.jobRun.update({
      where,
      data: { status: 'failed', attempts, error, nextAttemptAt: new Date(ctx.now.getTime() + delay), finishedAt: ctx.now },
    });
    return 'failed';
  }
  // Terminal: claim() never takes an `abandoned` row, so this runs once per (job, period).
  await prisma.jobRun.update({ where, data: { status: 'abandoned', attempts, error, nextAttemptAt: null, finishedAt: ctx.now } });
  // An unavailable AI was reported by the router; a ReportedUpstreamError where it happened.
  if (!(err instanceof AiUnavailableError || err instanceof ReportedUpstreamError)) {
    reportError(err, { scope: 'content.jobs', jobKey: job.jobKey, periodKey: job.periodKey, attempts });
  }
  // One email. If this send fails, notifyOnce records the failed row and
  // reports it, but nothing retries it (the job is terminal) — the Journal
  // still shows the abandoned job.
  await notifyOnce(
    'job.failed',
    `${job.jobKey}|${job.periodKey}`,
    () => jobFailedEmail({ jobKey: job.jobKey, periodKey: job.periodKey, error, link: studioLink('/journal') }),
    ctx.send,
  );
  return 'abandoned';
}

// ── Day state ──

type DayState =
  | { kind: 'closed' }
  | { kind: 'not_validated' }
  | { kind: 'open'; written: boolean };

/**
 * Where the drafts of studio-local `day` stand: `closed` (no slot, skipped,
 * done, or no enabled platform planned), `not_validated` (its week is not
 * validated yet), or `open` — `written` once every planned platform has a
 * draft no generation is working on, in any status (a `failed` or `stale`
 * draft is the owner's to retry).
 */
async function dayState(day: string): Promise<DayState> {
  const slot = await prisma.contentSlot.findFirst({
    where: { date: dateOf(day) },
    include: { week: { select: { status: true } }, drafts: { select: { platform: true, status: true } } },
  });
  if (!slot || slot.status === 'skipped' || slot.status === 'done') return { kind: 'closed' };
  if (slot.week.status !== 'validated') return { kind: 'not_validated' };
  const enabled = await enabledPlatforms();
  const planned = parseSlotPlatforms(slot.platforms)
    .map((p) => p.platform)
    .filter((p) => enabled.includes(p));
  if (planned.length === 0) return { kind: 'closed' };
  const status = new Map(slot.drafts.map((d) => [d.platform, d.status]));
  const pending = planned.filter((p) => !status.has(p) || status.get(p) === 'generating').length;
  return { kind: 'open', written: pending === 0 };
}

// ── Handlers ──

/** The Analyst's report of the week starting `monday`; a plain placeholder when it fails (the email still goes out). */
async function weekReport(monday: string, periodKey: string): Promise<ReportNarrative> {
  try {
    return await runAgent('analyst', { kind: 'week_report', id: monday }, 'scheduled_job');
  } catch (err) {
    // runAgent recorded the failure on its AgentRun and, with the router,
    // already reported everything but a refusal or an unusable answer.
    if (err instanceof AiRefusedError || err instanceof AiInvalidOutputError) {
      reportError(err, { scope: 'content.jobs', jobKey: 'week.email', periodKey, phase: 'week_report' });
    }
    return REPORT_UNAVAILABLE;
  }
}

const findWeek = (startsOn: string) =>
  prisma.contentWeek.findUnique({ where: { startsOn: dateOf(startsOn) }, select: { id: true, status: true, firstDay: true } });

const HANDLERS: Record<JobKey, Handler> = {
  /** Next week's 3 directions; retries a week left `proposing` by a failed Strategist run. */
  'week.propose': async ({ periodKey }, ctx) => {
    const week = await findWeek(periodDate(periodKey));
    if (!week) {
      try {
        await startWeek({ now: ctx.now, origin: 'scheduled_job' });
      } catch (err) {
        // Started meanwhile (owner "Lancer la semaine"): check it on the next tick.
        if (err instanceof HttpError && err.code === 'week_exists') return 'waiting';
        throw err;
      }
      return 'done';
    }
    if (week.status === 'proposing') await proposeDirections(week.id, 'scheduled_job');
    return 'done';
  },

  /** The Sunday email: last week's report + the 3 directions, once they exist. */
  'week.email': async ({ periodKey }, ctx) => {
    const startsOn = periodDate(periodKey);
    const week = await findWeek(startsOn);
    if (!week || week.status === 'proposing') return 'waiting';
    if (week.status === 'skipped') return 'done';
    const dto = await getWeek(week.id);
    const proposals = dto.proposals;
    if (!proposals) return 'waiting';
    const pastMonday = addDaysYmd(startsOn, -7);
    const res = await notifyOnce(
      'week.proposals',
      periodKey,
      async () => {
        const [report, audience] = await Promise.all([
          weekReport(pastMonday, periodKey),
          getAudience({ from: zonedTime(pastMonday, 0, ctx.tz), to: ctx.now }),
        ]);
        return weekProposalsEmail({ week: dto, proposals, report, audience: summariseAudience(audience), link: studioLink('/semaine') });
      },
      ctx.send,
    );
    requireDelivered(res, `The Sunday email (${periodKey})`);
    return 'done';
  },

  /** Sunday 15:00 / 20:00, only while next week has directions or titles but is not validated. */
  'week.remind': async ({ periodKey }, ctx) => {
    const week = await findWeek(periodDate(periodKey));
    if (!week || ['proposing', 'validated', 'skipped'].includes(week.status)) return 'done';
    const email = () => weekReminderEmail({ status: week.status, firstDay: ymdOf(week.firstDay), link: studioLink('/semaine') });
    const res = await notifyOnce('week.remind', periodKey, email, ctx.send);
    requireDelivered(res, `The week reminder (${periodKey})`);
    return 'done';
  },

  /**
   * The day's drafts, as soon as its week is validated (even late). Writes
   * only missing drafts and crashed runs: a draft that failed (recorded on its
   * row and reported by generateDraftsForDay) or went stale is left to the
   * owner — never a paid retry from the scheduler (Ruling 12).
   */
  'day.generate': async ({ periodKey }) => {
    const day = periodDate(periodKey);
    const before = await dayState(day);
    if (before.kind === 'closed') return 'done';
    if (before.kind === 'not_validated') return 'waiting';
    if (before.written) return 'done';
    await generateDraftsForDay(day, 'scheduled_job', undefined, { includeFailed: false });
    const after = await dayState(day);
    if (after.kind !== 'open') return after.kind === 'closed' ? 'done' : 'waiting';
    // Not written: another run still holds a draft — check again next tick.
    return after.written ? 'done' : 'waiting';
  },

  /** The day's drafts email, once they are written (failed ones say so). */
  'day.notify': async ({ periodKey }, ctx) => {
    const day = periodDate(periodKey);
    const state = await dayState(day);
    if (state.kind === 'closed') return 'done';
    if (state.kind === 'not_validated' || !state.written) return 'waiting';
    const slot = (await todayBoard(day)).slot;
    if (!slot) return 'done';
    const res = await notifyOnce('day.drafts', periodKey, () => dailyDraftsEmail({ day, topic: slot.topic, drafts: slot.drafts, link: studioLink('') }), ctx.send);
    requireDelivered(res, `The drafts email (${periodKey})`);
    return 'done';
  },

  /** 09:00 / 13:00, only when drafts wait for approval or publication. */
  'day.remind': async ({ periodKey }, ctx) => {
    const pending = await pendingCounts(periodDate(periodKey));
    if (pending.approve + pending.publish === 0) return 'done';
    const res = await notifyOnce('day.remind', periodKey, () => dayReminderEmail({ pending, link: studioLink('') }), ctx.send);
    requireDelivered(res, `The day reminder (${periodKey})`);
    return 'done';
  },

  'budget.check': async (_job, ctx) => {
    await checkBudget(ctx.now, ctx.send);
    return 'done';
  },
};

// ── Tick ──

async function runJob(job: DueJob, ctx: Ctx): Promise<JobRunStatus | null> {
  const claimed = await claim(job, ctx.now);
  if (!claimed) return null;
  const key = { jobKey_periodKey: { jobKey: job.jobKey, periodKey: job.periodKey } };
  let outcome: Outcome;
  try {
    outcome = await HANDLERS[job.jobKey](job, ctx);
  } catch (err) {
    return recordFailure(job, ctx, claimed.attempts, err);
  }
  if (outcome === 'waiting') {
    await prisma.jobRun.update({ where: key, data: { status: 'waiting', finishedAt: ctx.now } });
    return 'waiting';
  }
  await prisma.jobRun.update({ where: key, data: { status: 'succeeded', finishedAt: ctx.now, error: null, nextAttemptAt: null } });
  return 'succeeded';
}

/**
 * Run every job due at `now` (studio timezone from the settings), in
 * order. `send` replaces the email sender (tests).
 */
export async function runTick(now: Date = new Date(), opts: { send?: Sender } = {}): Promise<TickSummary> {
  const tz = await getStudioTimezone();
  const ctx: Ctx = { now, tz, send: opts.send };
  const summary: TickSummary = { ran: [], skipped: 0 };
  for (const job of dueJobs(now, tz)) {
    const started = Date.now();
    let status: JobRunStatus | 'error' | null;
    try {
      status = await runJob(job, ctx);
    } catch (err) {
      // The job's own bookkeeping failed (claim, row update, alert): it cannot
      // be recorded on its row, so it is reported and shown in the summary.
      reportError(err, { scope: 'content.jobs', jobKey: job.jobKey, periodKey: job.periodKey, phase: 'bookkeeping' });
      status = 'error';
    }
    if (status === null) {
      summary.skipped++;
      continue;
    }
    summary.ran.push({ jobKey: job.jobKey, periodKey: job.periodKey, status });
    console.info(`[content.jobs] ${JSON.stringify({ jobKey: job.jobKey, periodKey: job.periodKey, status, ms: Date.now() - started })}`);
  }
  return summary;
}
