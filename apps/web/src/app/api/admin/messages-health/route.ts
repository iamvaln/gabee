import { MessagesHealthRangeSchema, type MessagesHealthResponse } from '@gabee/types';
import { route, json, requireAdmin, HttpError } from '@/lib/server/http';
import { getMessagesHealth } from '@/lib/server/services/admin-messages-health';

export const runtime = 'nodejs';

// GET /api/admin/messages-health?range=7d|30d|90d|all — feature-health aggregates
// for the parent → kid messaging surface (changes-v1 §1.5). Admin-gated. The payload
// is counts + rates + timestamps + distributions only — NEVER message content.
export const GET = route(async (req) => {
  await requireAdmin(req);
  const url = new URL(req.url);
  const rawRange = url.searchParams.get('range') ?? '30d';
  const parsed = MessagesHealthRangeSchema.safeParse(rawRange);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_range', 'range must be one of 7d, 30d, 90d, all');
  }
  const data = await getMessagesHealth(parsed.data);
  return json<MessagesHealthResponse>(data);
});
