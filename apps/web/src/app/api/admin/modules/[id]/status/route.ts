import { SetModuleStatusRequestSchema } from '@gabee/types';
import { route, json, readJson, requireSuperAdmin } from '@/lib/server/http';
import { setModuleStatus } from '@/lib/server/services/admin-modules';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// A0b — enable/disable a module: super_admin only (admin spec §2). Disabling is a soft
// kill that hides the module from every kid hub.
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { id } = await ctx.params;
  const body = await readJson(req, SetModuleStatusRequestSchema);
  const result = await setModuleStatus(id, body);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: body.status === 'disabled' ? 'module.disable' : 'module.enable',
    targetKind: 'module',
    targetId: id,
    diff: { status: body.status },
  });
  return json(result);
});
