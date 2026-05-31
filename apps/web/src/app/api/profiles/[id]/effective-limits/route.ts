import type { KidEffectiveLimits } from '@gabee/types';
import { route, json, requireParent, HttpError } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { getKidEffectiveLimits } from '@/lib/server/services/healthy-use';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/profiles/[id]/effective-limits — the kid app reads this on profile
 * select to get the concrete numeric values (override ?? admin default, clamped
 * to admin's [min,max]) it uses to drive overlays, daily caps, and streaks.
 */
export const GET = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  const owned = await prisma.childProfile.findFirst({
    where: { id, parentId: session.parentId },
    select: { id: true },
  });
  let allowed = !!owned;
  if (!allowed) {
    const link = await prisma.parentChildLink.findFirst({
      where: { childId: id, parentId: session.parentId },
      select: { childId: true },
    });
    allowed = !!link;
  }
  if (!allowed) throw new HttpError(404, 'profile_not_found', 'Child profile not found');
  const limits = await getKidEffectiveLimits(id);
  return json<KidEffectiveLimits>(limits);
});
