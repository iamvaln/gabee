import { ClaimGiftRequestSchema, type ClaimGiftResponse } from '@gabee/types';
import { route, json, readJson, requireParent } from '@/lib/server/http';
import { claimGift } from '@/lib/server/services/gifts';

export const runtime = 'nodejs';

// POST /api/gifts/claim { gift_id } — the kid tapped "Accept the gift". Adds the
// bonus to total_stars (additive) and marks the gift claimed. Idempotent.
export const POST = route(async (req) => {
  const session = await requireParent(req);
  const { gift_id } = await readJson(req, ClaimGiftRequestSchema);
  const result = await claimGift(session.parentId, gift_id);
  return json<ClaimGiftResponse>(result);
});
