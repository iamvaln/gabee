import type { Prisma } from '@gabee/db';
import { route, json, requireKidDevice } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { markAsRead } from '@/lib/server/services/messages';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/messages/[id]/read — kid app reports "Continue" was tapped on the
// reader screen. Sets the message to `read`, fires the read event server-side
// so the analytics view has it even if the kid app is offline at sync time.
export const POST = route<Ctx>(async (req, ctx) => {
  const session = await requireKidDevice(req);
  const { id } = await ctx.params;
  const { message, childId, timeToReadMs } = await markAsRead(session.parentId, id);

  await prisma.event.create({
    data: {
      eventId: crypto.randomUUID(),
      profileId: childId,
      sessionId: null,
      name: 'parent_message_read',
      clientTs: new Date(),
      schemaVersion: 1,
      payload: {
        name: 'parent_message_read',
        child_id: childId,
        message_id: message.id,
        time_to_read_ms: timeToReadMs,
      } satisfies Prisma.InputJsonValue,
    },
  });

  return json({ message });
});
