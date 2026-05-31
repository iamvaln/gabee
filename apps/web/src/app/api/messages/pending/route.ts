import type { KidPendingMessagesResponse } from '@gabee/types';
import { route, json, requireParent, HttpError } from '@/lib/server/http';
import { listPendingForChild } from '@/lib/server/services/messages';

export const runtime = 'nodejs';

// GET /api/messages/pending?child_id=<id> — what the kid app should surface
// between lessons (parent spec §8.4). Kid app calls cross-origin with the parent
// JWT as bearer. `child_id` is REQUIRED so we can scope to one child + verify the
// child belongs to the parent.
export const GET = route(async (req) => {
  const session = await requireParent(req);
  const url = new URL(req.url);
  const childId = url.searchParams.get('child_id');
  if (!childId) {
    throw new HttpError(400, 'missing_child_id', 'child_id query parameter is required');
  }
  const messages = await listPendingForChild(session.parentId, childId);
  return json<KidPendingMessagesResponse>({ messages });
});
