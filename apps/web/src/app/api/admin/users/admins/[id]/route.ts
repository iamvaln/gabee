import { SetRoleRequestSchema } from '@gabee/types';
import { route, json, readJson, requireSuperAdmin } from '@/lib/server/http';
import { setRole, listAdmins } from '@/lib/server/services/admin-users';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// Change or revoke a role: super_admin only (admin spec §2). `parent` revokes admin.
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { id } = await ctx.params;
  const body = await readJson(req, SetRoleRequestSchema);
  const { previousRole, role } = await setRole(id, body);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'user.role_change',
    targetKind: 'account',
    targetId: id,
    diff: { from: previousRole, to: role },
  });
  return json(await listAdmins());
});
