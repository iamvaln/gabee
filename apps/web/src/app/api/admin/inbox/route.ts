import { route, json, requireAdmin } from '@/lib/server/http';
import { listInbox } from '@/lib/server/services/admin-frontdesk';

export const runtime = 'nodejs';

// I1 — landing contact messages (admin spec §8). GET → InboxListResponse.
export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await listInbox());
});
