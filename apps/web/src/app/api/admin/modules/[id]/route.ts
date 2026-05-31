import { UpdateModuleRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin, requireSuperAdmin } from '@/lib/server/http';
import { getModule, updateModule } from '@/lib/server/services/admin-modules';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  return json(await getModule(id));
});

// A0a — edit module metadata: super_admin only (admin spec §2).
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { id } = await ctx.params;
  const patch = await readJson(req, UpdateModuleRequestSchema);
  const result = await updateModule(id, patch);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'module.edit',
    targetKind: 'module',
    targetId: id,
    diff: patch,
  });
  return json(result);
});
