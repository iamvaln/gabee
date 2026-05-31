import type { HealthyUseLimits } from '@gabee/types';
import { route, json, requireParent } from '@/lib/server/http';
import { getAdminLimits } from '@/lib/server/services/healthy-use';

export const runtime = 'nodejs';

/**
 * GET /api/healthy-use-limits — admin singleton (triplets + defaults + flags),
 * READ-ONLY for any authenticated parent. Used by the per-kid override editor
 * to show the bounds (`[min, max]`) the parent can pick within. Distinct from
 * `/api/admin/healthy-use-limits`, which gates on admin role and also exposes
 * PATCH.
 */
export const GET = route(async (req) => {
  await requireParent(req);
  const limits = await getAdminLimits();
  return json<HealthyUseLimits>(limits);
});
