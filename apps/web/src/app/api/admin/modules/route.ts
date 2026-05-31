import { route, json, requireAdmin } from '@/lib/server/http';
import { listModules } from '@/lib/server/services/admin-modules';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await listModules());
});
