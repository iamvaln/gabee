import type { PendingChangesResponse } from '@gabee/types';
import { route, json, requireAdmin } from '@/lib/server/http';
import { getDefaultCurriculumId } from '@/lib/server/admin';
import { listPendingChanges } from '@/lib/server/services/admin-publish';

export const runtime = 'nodejs';

/**
 * GET /api/admin/content/pending — per-module diff between the current confirmed pool
 * and the latest published bundle snapshot. Admin (not super-admin) since this is a
 * read; the publish action itself is super-admin only.
 */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const curriculumId = await getDefaultCurriculumId();
  const modules = await listPendingChanges(curriculumId);
  return json<PendingChangesResponse>({ modules });
});
