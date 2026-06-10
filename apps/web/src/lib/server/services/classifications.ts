import type { ClassificationItem, InitiationLabel, NotificationDigestCadence, PendingSession } from '@gabee/types';
import { prisma } from '../db';
import { accessibleKidIds } from '../kid-access';
import { mapPendingSession } from '../mappers';
import { sendClassificationDigest } from '../mailgun';
import { PARENT_APP_URL } from '../env';

/**
 * Sessions awaiting a label for any kid this parent can access — direct
 * children + co-parented kids (product §13.2 + co-parent §10).
 */
export async function listPending(parentId: string, childId?: string): Promise<PendingSession[]> {
  const ids = await accessibleKidIds(parentId);
  if (ids.length === 0) return [];
  const rows = await prisma.sessionClassification.findMany({
    where: {
      label: null,
      profileId: childId ? childId : { in: ids },
      // When a specific childId is requested, also verify it's accessible — the
      // `in: ids` filter wouldn't kick in if we'd narrowed to a single id.
      ...(childId && !ids.includes(childId) ? { id: '__never__' } : {}),
    },
    orderBy: { startedAt: 'desc' },
  });
  return rows.map(mapPendingSession);
}

export interface ClassifiedResult {
  session_id: string;
  label: InitiationLabel;
  classified_at: string;
}

/**
 * Apply labels, scoped to sessions belonging to ANY kid this parent can
 * access (primary parent OR linked co-parent). A co-parent classifying a
 * session of a shared kid produces the same family_activity entry as the
 * primary parent would — fair signal in the feed.
 */
export async function classifySessions(
  parentId: string,
  items: ClassificationItem[],
  nudgeSentAt: string | null,
): Promise<ClassifiedResult[]> {
  const classifiedAt = new Date();
  const results: ClassifiedResult[] = [];
  const ids = await accessibleKidIds(parentId);
  if (ids.length === 0) return results;
  for (const item of items) {
    const res = await prisma.sessionClassification.updateMany({
      where: { sessionId: item.session_id, profileId: { in: ids } },
      data: {
        label: item.label,
        classifiedAt,
        ...(nudgeSentAt ? { nudgeSentAt: new Date(nudgeSentAt) } : {}),
      },
    });
    if (res.count > 0) {
      results.push({
        session_id: item.session_id,
        label: item.label,
        classified_at: classifiedAt.toISOString(),
      });
    }
  }
  return results;
}

// ─── Classification digest — invoked by the cron sidecar ─────────────────────

/** Days between sends for each NotificationDigestCadence value. `off` is
 *  filtered out before this is read; the value here is sentinel. */
const CADENCE_DAYS: Record<NotificationDigestCadence, number> = {
  off: Infinity,
  daily: 1,
  every_2_days: 2,
  weekly: 7,
};

export interface DigestRunResult {
  scanned: number;
  due: number;
  sent: number;
  skipped_no_pending: number;
  failed: number;
}

/**
 * For each parent who opted into a classification digest, send an email
 * listing pending session classifications — if any AND if their cadence is
 * due since their last successful send. Idempotent: re-running within the
 * cadence window for the same parent is a no-op.
 *
 * Designed for an external scheduler (the `cron-digest` sidecar) to call
 * once a day. Returns a small counters object so the caller can log /
 * surface the run summary without parsing logs.
 */
export async function runClassificationDigest(now: Date = new Date()): Promise<DigestRunResult> {
  const prefs = await prisma.notificationPrefs.findMany({
    where: { classificationDigest: { not: 'off' } },
    include: { parent: { select: { id: true, email: true, displayNameForKids: true } } },
  });

  const result: DigestRunResult = {
    scanned: prefs.length,
    due: 0,
    sent: 0,
    skipped_no_pending: 0,
    failed: 0,
  };

  // Deeplink the email CTA at the classify page on the parent host. Fall back
  // to a relative path when PARENT_APP_URL isn't configured (dev), even
  // though the cron is unlikely to fire there.
  const classifyUrl = `${PARENT_APP_URL ?? ''}/parent/classify`;

  for (const row of prefs) {
    const cadence = row.classificationDigest as NotificationDigestCadence;
    const sinceLastMs = row.lastClassificationDigestSentAt
      ? now.getTime() - row.lastClassificationDigestSentAt.getTime()
      : Infinity;
    const dueMs = CADENCE_DAYS[cadence] * 24 * 60 * 60 * 1000;
    // Subtract a 1h grace so a cron that fires at 08:00:00 on day N and 07:59:59
    // on day N+1 still sends — clock jitter, DST nudges, runner startup delay.
    if (sinceLastMs < dueMs - 60 * 60 * 1000) continue;
    result.due += 1;

    const ids = await accessibleKidIds(row.parentId);
    if (ids.length === 0) {
      result.skipped_no_pending += 1;
      continue;
    }
    const pendingCount = await prisma.sessionClassification.count({
      where: { label: null, profileId: { in: ids } },
    });
    if (pendingCount === 0) {
      // No pending = don't mail; we'd just be spamming. Also DON'T bump the
      // sent_at — we want the next eligible run with content to fire normally.
      result.skipped_no_pending += 1;
      continue;
    }

    try {
      const display =
        (row.parent.displayNameForKids || '').trim() ||
        row.parent.email.split('@')[0] ||
        row.parent.email;
      await sendClassificationDigest({
        to: row.parent.email,
        parent_display: display,
        pending_count: pendingCount,
        cadence,
        classify_url: classifyUrl,
      });
      await prisma.notificationPrefs.update({
        where: { parentId: row.parentId },
        data: { lastClassificationDigestSentAt: now },
      });
      result.sent += 1;
    } catch (e) {
      console.error(`[digest] send failed for parent ${row.parentId}:`, e);
      result.failed += 1;
    }
  }

  return result;
}
