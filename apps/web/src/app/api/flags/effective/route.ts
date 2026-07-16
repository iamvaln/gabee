import { EffectiveFlagsResponseSchema } from '@gabee/types';
import { route, json, requireKidDevice } from '@/lib/server/http';
import { getEffectiveFlagsForParent } from '@/lib/server/services/feature-flags';

export const runtime = 'nodejs';

/**
 * GET /api/flags/effective — the kid app reads this at launch + profile select.
 * Bearer identifies the parent account (same auth as every kid API). Targeting
 * is per account, so no per-profile parameter is needed.
 */
export const GET = route(async (req) => {
  const session = await requireKidDevice(req);
  const flags = await getEffectiveFlagsForParent(session.parentId);
  return json(EffectiveFlagsResponseSchema.parse({ flags }));
});
