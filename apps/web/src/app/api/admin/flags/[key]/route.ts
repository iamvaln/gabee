import { UpdateFlagRequestSchema } from '@gabee/types';
import { route, json, readJson, requireSuperAdmin } from '@/lib/server/http';
import { updateFlagDefault } from '@/lib/server/services/feature-flags';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ key: string }> };

// Global default toggle (+ description): super_admin only (global release lever).
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { key } = await ctx.params;
  const patch = await readJson(req, UpdateFlagRequestSchema);
  await updateFlagDefault(key, patch);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'flag.update',
    targetKind: 'feature_flag',
    targetId: key,
    diff: patch,
  });
  return json({ ok: true });
});
