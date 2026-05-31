import { UpdateKidLimitsRequestSchema, type KidLimitsOverrides } from '@gabee/types';
import { route, json, readJson, requireParent, HttpError } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { getKidLimitsOverrides, updateKidLimitsOverrides } from '@/lib/server/services/healthy-use';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

async function assertParentOwnsKid(parentId: string, kidId: string): Promise<void> {
  const owned = await prisma.childProfile.findFirst({
    where: { id: kidId, parentId },
    select: { id: true },
  });
  if (owned) return;
  const link = await prisma.parentChildLink.findFirst({
    where: { childId: kidId, parentId },
    select: { childId: true },
  });
  if (link) return;
  throw new HttpError(404, 'profile_not_found', 'Child profile not found');
}

/** GET — read this kid's per-parameter overrides (null = inherit). */
export const GET = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  await assertParentOwnsKid(session.parentId, id);
  const overrides = await getKidLimitsOverrides(id);
  return json<KidLimitsOverrides>(overrides);
});

/** PATCH — partial override update. Server clamps to admin's [min,max] window. */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  await assertParentOwnsKid(session.parentId, id);
  const input = await readJson(req, UpdateKidLimitsRequestSchema);
  const overrides = await updateKidLimitsOverrides(id, input);
  return json<KidLimitsOverrides>(overrides);
});
