import { route, json, requireAdmin } from '@/lib/server/http';
import { listFlagsForAdmin } from '@/lib/server/services/feature-flags';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await listFlagsForAdmin());
});
