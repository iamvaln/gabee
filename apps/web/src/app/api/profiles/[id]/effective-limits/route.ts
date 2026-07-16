import type { KidEffectiveLimits } from '@gabee/types';
import { route, json, requireKidDevice } from '@/lib/server/http';
import { assertParentCanAccessKid } from '@/lib/server/kid-access';
import { getKidEffectiveLimits } from '@/lib/server/services/healthy-use';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/profiles/[id]/effective-limits — the kid app reads this on profile
 * select to get the concrete numeric values (override ?? admin default, clamped
 * to admin's [min,max]) it uses to drive overlays, daily caps, and streaks.
 *
 * Accessible to primary parent + linked co-parents — both should see the same
 * effective limits for the shared kid.
 */
export const GET = route<Ctx>(async (req, ctx) => {
  const session = await requireKidDevice(req);
  const { id } = await ctx.params;
  await assertParentCanAccessKid(session.parentId, id);
  const limits = await getKidEffectiveLimits(id);
  return json<KidEffectiveLimits>(limits);
});
