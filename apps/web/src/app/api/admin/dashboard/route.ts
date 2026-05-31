import { route, json, requireAdmin } from '@/lib/server/http';
import { getDashboard } from '@/lib/server/services/admin-observability';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await getDashboard());
});
