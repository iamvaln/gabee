import type { Prisma } from '@gabee/db';
import { route, json, requireParent } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { deleteUnreadMessage, getMessageForParent } from '@/lib/server/services/messages';
import { recordFamilyActivity } from '@/lib/server/services/family-activity';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/messages/[id] — fetch a single message the parent sent (M3 detail).
export const GET = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  const message = await getMessageForParent(session.parentId, id);
  return json({ message });
});

// DELETE /api/messages/[id] — soft-delete while unread (parent spec §8.6).
// Returns 409 if the kid has already read it (read is immutable).
export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  const { message, ageAtDeletionMs } = await deleteUnreadMessage(session.parentId, id);

  await prisma.event.create({
    data: {
      eventId: crypto.randomUUID(),
      profileId: null,
      sessionId: null,
      name: 'parent_message_deleted_by_sender',
      clientTs: new Date(),
      schemaVersion: 1,
      payload: {
        name: 'parent_message_deleted_by_sender',
        parent_id: session.parentId,
        message_id: message.id,
        age_at_deletion_ms: ageAtDeletionMs,
      } satisfies Prisma.InputJsonValue,
    },
  });

  // Family activity log — co-parents see "X deleted a message for <kid>".
  void recordFamilyActivity({
    childId: message.to_child_id,
    actorParentId: session.parentId,
    action: 'message_deleted',
    payload: { message_id: message.id, age_at_deletion_ms: ageAtDeletionMs },
  });

  return json({ message });
});
