import { SetFlagOverrideRequestSchema, DeleteFlagOverrideRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin, requireSuperAdmin } from '@/lib/server/http';
import { listFlagOverrides, setFlagOverride, deleteFlagOverride } from '@/lib/server/services/feature-flags';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ key: string }> };

// List overrides (with parent emails) — any admin may read.
export const GET = route<Ctx>(async (req, ctx) => {
  await requireAdmin(req);
  const { key } = await ctx.params;
  return json(await listFlagOverrides(key));
});

// Add/update an override by parent email — super_admin only.
export const PUT = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { key } = await ctx.params;
  const body = await readJson(req, SetFlagOverrideRequestSchema);
  const { parentId } = await setFlagOverride(key, body);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'flag.override_set',
    targetKind: 'feature_flag',
    targetId: key,
    diff: { email: body.email, enabled: body.enabled, parentId },
  });
  return json({ ok: true });
});

// Remove an override by parent email — super_admin only.
export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { key } = await ctx.params;
  const body = await readJson(req, DeleteFlagOverrideRequestSchema);
  const { parentId } = await deleteFlagOverride(key, body.email);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'flag.override_remove',
    targetKind: 'feature_flag',
    targetId: key,
    diff: { email: body.email, parentId },
  });
  return json({ ok: true });
});
