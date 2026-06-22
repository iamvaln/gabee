import type { PendingGiftsResponse } from '@gabee/types';
import { route, json, requireParent, HttpError } from '@/lib/server/http';
import { listPendingGifts } from '@/lib/server/services/gifts';

export const runtime = 'nodejs';

// GET /api/gifts/pending?child_id=<id> — unclaimed gifts for one child. The kid app
// calls cross-origin with the parent JWT as bearer; `child_id` is required so we can
// scope to one child and verify it belongs to the parent.
export const GET = route(async (req) => {
  const session = await requireParent(req);
  const childId = new URL(req.url).searchParams.get('child_id');
  if (!childId) {
    throw new HttpError(400, 'missing_child_id', 'child_id query parameter is required');
  }
  const result = await listPendingGifts(session.parentId, childId);
  return json<PendingGiftsResponse>(result);
});
