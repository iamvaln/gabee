import { route, json, requireAdmin } from '@/lib/server/http';
import { listChildren } from '@/lib/server/services/admin-users';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await listChildren());
});
