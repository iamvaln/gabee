import { json, route, requireParent } from '@/lib/server/http';
import { removeCoparent } from '@/lib/server/services/family';

export const runtime = 'nodejs';

interface RouteCtx {
  params: Promise<{ parentId: string }>;
}

// DELETE /api/family/link/:parentId — remove a linked parent from every child
// the requester shares with them. Phase 1: any linked parent can remove any
// other (the UI gates this to co-parents only).
export const DELETE = route<RouteCtx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { parentId } = await ctx.params;
  const result = await removeCoparent(session.parentId, parentId);
  return json(result);
});
