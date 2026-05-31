import { route, json, requireAdmin } from '@/lib/server/http';
import { getContentMatrix } from '@/lib/server/services/admin-content';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await getContentMatrix());
});
