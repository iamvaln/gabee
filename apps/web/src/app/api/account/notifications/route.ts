import {
  NotificationPrefsSchema,
  UpdateNotificationPrefsRequestSchema,
  type NotificationPrefs,
} from '@gabee/types';
import { route, json, readJson, requireParent } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';

export const runtime = 'nodejs';

/**
 * Per-parent notification preferences (parent spec §10.5 + §4.3). Security +
 * co-parent invite emails are always-on and not stored here. The row is created
 * lazily on first GET so a fresh parent sees the spec defaults (daily digest,
 * weekly summary on, feedback response on).
 */

function toPrefs(row: {
  classificationDigest: NotificationPrefs['classification_digest'];
  weeklySummary: boolean;
  feedbackResponse: boolean;
}): NotificationPrefs {
  return NotificationPrefsSchema.parse({
    classification_digest: row.classificationDigest,
    weekly_summary: row.weeklySummary,
    feedback_response: row.feedbackResponse,
  });
}

/** Server defaults — match the schema's defaults so first GET + cold PATCH agree. */
async function loadOrCreatePrefs(parentId: string) {
  return prisma.notificationPrefs.upsert({
    where: { parentId },
    update: {},
    create: { parentId },
  });
}

// GET /api/account/notifications — fetch (or lazily create) the prefs row.
export const GET = route(async (req) => {
  const session = await requireParent(req);
  const row = await loadOrCreatePrefs(session.parentId);
  return json<NotificationPrefs>(toPrefs(row));
});

// PATCH /api/account/notifications — partial update; only the keys present in
// the body are written. Unsupported keys are stripped by the Zod schema.
export const PATCH = route(async (req) => {
  const session = await requireParent(req);
  const patch = await readJson(req, UpdateNotificationPrefsRequestSchema);
  // Ensure the row exists before update (parent who never hit GET yet).
  await loadOrCreatePrefs(session.parentId);
  const row = await prisma.notificationPrefs.update({
    where: { parentId: session.parentId },
    data: {
      ...(patch.classification_digest !== undefined
        ? { classificationDigest: patch.classification_digest }
        : {}),
      ...(patch.weekly_summary !== undefined ? { weeklySummary: patch.weekly_summary } : {}),
      ...(patch.feedback_response !== undefined
        ? { feedbackResponse: patch.feedback_response }
        : {}),
    },
  });
  return json<NotificationPrefs>(toPrefs(row));
});
