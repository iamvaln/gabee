import { InviteAdminRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin, requireSuperAdmin } from '@/lib/server/http';
import { listAdmins, promoteAdmin } from '@/lib/server/services/admin-users';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await listAdmins());
});

// U6 — promote an existing account by email: super_admin only (admin spec §2).
export const POST = route(async (req) => {
  const session = await requireSuperAdmin(req);
  const body = await readJson(req, InviteAdminRequestSchema);
  const { id, previousRole, role } = await promoteAdmin(body);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'user.role_change',
    targetKind: 'account',
    targetId: id,
    diff: { email: body.email, from: previousRole, to: role },
  });
  return json(await listAdmins(), 201);
});
