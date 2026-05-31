import { UpdateHealthyUseLimitsRequestSchema, type HealthyUseLimits } from '@gabee/types';
import { route, json, readJson, requireAdmin, requireSuperAdmin } from '@/lib/server/http';
import { getAdminLimits, updateAdminLimits } from '@/lib/server/services/healthy-use';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

/** GET — admin read of the singleton (admin or super_admin). */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const limits = await getAdminLimits();
  return json<HealthyUseLimits>(limits);
});

/** PATCH — partial update of the singleton. Super-admin only. Audited. */
export const PATCH = route(async (req) => {
  const session = await requireSuperAdmin(req);
  const input = await readJson(req, UpdateHealthyUseLimitsRequestSchema);
  const updated = await updateAdminLimits(input);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'healthy_use_limits.update',
    targetKind: 'healthy_use_limits',
    targetId: 'default',
    diff: { changed_keys: Object.keys(input) },
  });
  return json<HealthyUseLimits>(updated);
});
