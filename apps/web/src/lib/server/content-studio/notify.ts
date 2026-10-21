import { Prisma } from '@gabee/db';
import { prisma } from '../db';
import { sendEmail, type EmailMessage, type EmailSendResult } from '../email';
import { ADMIN_APP_URL, ADMIN_DIGEST_TO } from '../env';
import { reportError } from '../report-error';
import { dateOf } from './state';
import type { EmailContent } from './emails';

/**
 * Idempotent studio notifications (spec "Notifications"). One
 * `StudioNotification` row per (kind, period, recipient) is claimed BEFORE the
 * send, so a retried job or two overlapping ticks never email anyone twice;
 * a failed send keeps its row as `failed` and the next tick takes it over.
 */

export const NOTIFICATION_KINDS = ['week.proposals', 'day.drafts', 'week.remind', 'day.remind', 'budget.alert', 'job.failed'] as const;

export type NotifyResult = { sent: number; skipped: number; failed: number; no_recipients?: true };
export type Sender = (msg: EmailMessage) => Promise<EmailSendResult>;

/** A `sending` row older than this belongs to a crashed tick and may be taken over. */
const SENDING_STALE_MS = 10 * 60_000;

/** Admin Communication page URL (`path` is '' or starts with `/`). */
export const studioLink = (path = '') => `${ADMIN_APP_URL.replace(/\/$/, '')}/admin/communication${path}`;

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

async function recipients(): Promise<string[]> {
  const row = await prisma.studioSettings.findUnique({ where: { id: 'default' }, select: { recipients: true } });
  const own = (row?.recipients ?? []).map((r) => r.trim()).filter(Boolean);
  return [...new Set(own.length > 0 ? own : splitList(ADMIN_DIGEST_TO))];
}

const warnedNoRecipients = new Set<string>();

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Take the right to send to `recipient`: a fresh row, or a failed / abandoned one. */
async function claim(kind: string, periodKey: string, recipient: string): Promise<boolean> {
  try {
    await prisma.studioNotification.create({ data: { kind, periodKey, recipient, status: 'sending' } });
    return true;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
  const taken = await prisma.studioNotification.updateMany({
    where: {
      kind,
      periodKey,
      recipient,
      OR: [{ status: 'failed' }, { status: 'sending', updatedAt: { lt: new Date(Date.now() - SENDING_STALE_MS) } }],
    },
    data: { status: 'sending', error: null },
  });
  return taken.count === 1;
}

export async function notifyOnce(kind: string, periodKey: string, build: () => EmailContent | Promise<EmailContent>, send: Sender = sendEmail): Promise<NotifyResult> {
  const to = await recipients();
  if (to.length === 0) {
    const key = `${kind}:${periodKey}`;
    if (!warnedNoRecipients.has(key)) {
      warnedNoRecipients.add(key);
      reportError(new Error('No recipient configured for studio emails: set them in the Communication settings or ADMIN_DIGEST_TO.'), { scope: 'content.notify', kind, periodKey });
    }
    return { sent: 0, skipped: 0, failed: 0, no_recipients: true };
  }

  const result: NotifyResult = { sent: 0, skipped: 0, failed: 0 };
  let content: Promise<EmailContent> | null = null;
  for (const recipient of to) {
    if (!(await claim(kind, periodKey, recipient))) {
      result.skipped++;
      continue;
    }
    let outcome: EmailSendResult;
    try {
      content ??= Promise.resolve(build());
      outcome = await send({ to: recipient, ...(await content) });
    } catch (e) {
      outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (outcome.ok) {
      await prisma.studioNotification.update({
        where: { kind_periodKey_recipient: { kind, periodKey, recipient } },
        data: { status: 'sent', providerId: outcome.providerId ?? null, error: null },
      });
      result.sent++;
    } else {
      const error = outcome.error ?? 'The email provider refused the message.';
      await prisma.studioNotification.update({
        where: { kind_periodKey_recipient: { kind, periodKey, recipient } },
        data: { status: 'failed', error },
      });
      reportError(new Error(`Studio email ${kind} (${periodKey}) to ${recipient} failed: ${error}`), { scope: 'content.notify', kind, periodKey, recipient });
      result.failed++;
    }
  }
  return result;
}

/** What waits for the owner on studio-local `day` (`YYYY-MM-DD`); also the admin nav badge. */
export async function pendingCounts(day: string): Promise<{ proposals: number; titles: number; approve: number; publish: number }> {
  const slot = { date: { lte: dateOf(day) }, status: { not: 'skipped' } };
  const [proposals, titles, approve, publish] = await Promise.all([
    prisma.contentWeek.count({ where: { status: 'proposals_ready' } }),
    prisma.contentWeek.count({ where: { status: 'titles_ready' } }),
    prisma.contentDraft.count({ where: { status: { in: ['ready', 'stale', 'failed'] }, slot } }),
    prisma.contentDraft.count({ where: { status: 'approved', slot } }),
  ]);
  return { proposals, titles, approve, publish };
}
