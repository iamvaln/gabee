import { UpdateSubModeRequestSchema } from '@gabee/types';
import { route, json, readJson, requireSuperAdmin } from '@/lib/server/http';
import { updateSubMode, deleteSubMode } from '@/lib/server/services/admin-sub-modes';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Per-row sub-mode mutations (super_admin). `id` is the registry dotted id
 * (`words.picture`). `module` + `key` are immutable — the schema in
 * `UpdateSubModeRequestSchema` does not include them.
 */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { id } = await ctx.params;
  const patch = await readJson(req, UpdateSubModeRequestSchema);
  const updated = await updateSubMode(id, patch);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'sub_mode.update',
    targetKind: 'sub_mode',
    targetId: id,
    diff: patch,
  });
  return json({ sub_mode: updated });
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { id } = await ctx.params;
  const result = await deleteSubMode(id);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'sub_mode.delete',
    targetKind: 'sub_mode',
    targetId: id,
  });
  return json(result);
});
