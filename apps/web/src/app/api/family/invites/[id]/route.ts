import { NextResponse } from 'next/server';
import { route, requireParent } from '@/lib/server/http';
import { cancelCoparentInvite } from '@/lib/server/services/family';

export const runtime = 'nodejs';

interface RouteCtx {
  params: Promise<{ id: string }>;
}

// DELETE /api/family/invites/:id — cancel a pending invite the requester sent.
export const DELETE = route<RouteCtx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  await cancelCoparentInvite(session.parentId, id);
  return new NextResponse(null, { status: 204 });
});
