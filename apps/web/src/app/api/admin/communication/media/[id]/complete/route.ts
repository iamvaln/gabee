import { route, json, requireAdmin } from '@/lib/server/http';
import { auditMedia, completeUpload } from '@/lib/server/content-studio/media';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const session = await requireAdmin(req);
  const { id } = await ctx.params;
  const asset = await completeUpload(id, session.parentId);
  await auditMedia(session.parentId, 'content.media.complete', id, { status: asset.status });
  return json({ asset });
});
