import { CreateSubModeRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin, requireSuperAdmin } from '@/lib/server/http';
import { listSubModes, createSubMode } from '@/lib/server/services/admin-sub-modes';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

/**
 * Sub-mode registry CRUD (Phase 2A admin). Listing is open to any admin so the
 * module detail page can render the table; mutations require super_admin.
 */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const moduleParam = new URL(req.url).searchParams.get('module') ?? undefined;
  return json(await listSubModes(moduleParam));
});

export const POST = route(async (req) => {
  const session = await requireSuperAdmin(req);
  const body = await readJson(req, CreateSubModeRequestSchema);
  const created = await createSubMode(body);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'sub_mode.create',
    targetKind: 'sub_mode',
    targetId: created.id,
    diff: body,
  });
  return json({ sub_mode: created }, 201);
});
