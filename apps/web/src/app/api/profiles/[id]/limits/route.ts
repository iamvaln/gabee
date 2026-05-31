import { UpdateKidLimitsRequestSchema, type KidLimitsOverrides } from '@gabee/types';
import { route, json, readJson, requireParent } from '@/lib/server/http';
import { assertParentCanAccessKid } from '@/lib/server/kid-access';
import { getKidLimitsOverrides, updateKidLimitsOverrides } from '@/lib/server/services/healthy-use';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** GET — read this kid's per-parameter overrides (null = inherit). */
export const GET = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  await assertParentCanAccessKid(session.parentId, id);
  const overrides = await getKidLimitsOverrides(id);
  return json<KidLimitsOverrides>(overrides);
});

/** PATCH — partial override update. Server clamps to admin's [min,max] window. */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  await assertParentCanAccessKid(session.parentId, id);
  const input = await readJson(req, UpdateKidLimitsRequestSchema);
  const overrides = await updateKidLimitsOverrides(id, input);
  return json<KidLimitsOverrides>(overrides);
});
