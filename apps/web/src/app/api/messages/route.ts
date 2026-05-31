import {
  CreateMessageRequestSchema,
  type ParentMessagesListResponse,
} from '@gabee/types';
import type { Prisma } from '@gabee/db';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { createMessage, listParentMessages } from '@/lib/server/services/messages';
import { recordFamilyActivity } from '@/lib/server/services/family-activity';

export const runtime = 'nodejs';

// POST /api/messages — parent composes a new mini-note (parent spec §8, M2).
export const POST = route(async (req) => {
  const session = await requireParent(req);
  const input = await readJson(req, CreateMessageRequestSchema);
  const message = await createMessage(session.parentId, input);

  // Fire `parent_message_sent` server-side (privacy: no text in the payload).
  await prisma.event.create({
    data: {
      eventId: crypto.randomUUID(),
      profileId: null,
      sessionId: null,
      name: 'parent_message_sent',
      clientTs: new Date(),
      schemaVersion: 1,
      payload: {
        name: 'parent_message_sent',
        parent_id: session.parentId,
        child_id: message.to_child_id,
        message_id: message.id,
        char_count: message.text.length,
      } satisfies Prisma.InputJsonValue,
    },
  });

  // Family activity log — co-parents see "X sent a message to <kid>".
  void recordFamilyActivity({
    childId: message.to_child_id,
    actorParentId: session.parentId,
    action: 'message_sent',
    payload: { message_id: message.id, char_count: message.text.length },
  });

  return json({ message }, 201);
});

// GET /api/messages?to=<child_id> — parent lists their sent messages (M1).
export const GET = route(async (req) => {
  const session = await requireParent(req);
  const url = new URL(req.url);
  const to = url.searchParams.get('to') ?? undefined;
  const messages = await listParentMessages(session.parentId, to);
  return json<ParentMessagesListResponse>({ messages });
});
