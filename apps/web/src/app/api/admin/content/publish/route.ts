import { PublishRequestSchema } from '@gabee/types';
import { route, json, readJson, requireSuperAdmin } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { getDefaultCurriculumId } from '@/lib/server/admin';
import { publishModule } from '@/lib/server/services/admin-publish';

export const runtime = 'nodejs';

/**
 * POST /api/admin/content/publish — mint a new ContentBundleVersion for a module.
 * Super-admin only (admin spec §2 — publishing is a release action). Audit is written
 * inside `publishModule` so the bundle.publish row + the snapshot are atomic to the
 * client (the snapshot is created first; if the audit write fails the snapshot still
 * stands, mirroring the pattern of the other content mutations).
 */
export const POST = route(async (req) => {
  const session = await requireSuperAdmin(req);
  const { module } = await readJson(req, PublishRequestSchema);

  const curriculumId = await getDefaultCurriculumId();
  const account = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { role: true },
  });
  const role = account?.role === 'admin' ? 'admin' : 'super_admin';

  const result = await publishModule(curriculumId, module, session.parentId, role);
  return json(result);
});
