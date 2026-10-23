import { json, requireAdmin } from '@/lib/server/http';
import { idParam, studioRoute } from '@/lib/server/content-studio/http-errors';
import { auditMedia, completeUpload } from '@/lib/server/content-studio/media';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const session = await requireAdmin(req);
  const id = await idParam(ctx);
  const asset = await completeUpload(id, session.parentId);
  await auditMedia(session.parentId, 'content.media.complete', id, { status: asset.status });
  return json({ asset });
});
