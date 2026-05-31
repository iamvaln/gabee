import type { DevicesListResponse } from '@gabee/types';
import { route, json, requireParent } from '@/lib/server/http';
import { listDevices } from '@/lib/server/services/devices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/devices — list this parent's active (non-revoked) paired devices
// (parent spec §10.4 ST3). Used by the Settings → Devices tab. The kid app
// never calls this (only the parent UI does, via the session cookie). Pair-link
// mint lives at POST /api/devices/pair; revoke at DELETE /api/devices/[id].
export const GET = route(async (req) => {
  const session = await requireParent(req);
  const body: DevicesListResponse = await listDevices(session.parentId);
  return json(body);
});
