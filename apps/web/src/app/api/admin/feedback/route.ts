import { route, json, requireAdmin } from '@/lib/server/http';
import { listFeedback } from '@/lib/server/services/admin-frontdesk';

export const runtime = 'nodejs';

// F1 — parent feedback list (admin spec §10). GET → FeedbackListResponse.
export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await listFeedback());
});
