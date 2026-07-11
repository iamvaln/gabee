import { route, json, requireSuperAdmin } from '@/lib/server/http';
import { getDeviceSightings } from '@/lib/server/services/admin-devices';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ deviceId: string }> };

// Task 9 — raw IP history is super-admin-only.
export const GET = route<Ctx>(async (req, ctx) => {
  await requireSuperAdmin(req);
  const { deviceId } = await ctx.params;
  return json(await getDeviceSightings(deviceId));
});
