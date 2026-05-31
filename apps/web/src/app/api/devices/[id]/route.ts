import { NextResponse } from 'next/server';
import { route, requireParent } from '@/lib/server/http';
import { revokeDevice } from '@/lib/server/services/devices';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/devices/[id] — revoke a paired device (parent spec §10.4 ST3).
// Sets `revokedAt = now()` and writes `device_revoked` activity rows for the
// family feed. Only the parent who paired the device can revoke it.
// Returns 204 No Content (idempotent — revoking an already-revoked row is a no-op).
export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  await revokeDevice(session.parentId, id);
  return new NextResponse(null, { status: 204 });
});
