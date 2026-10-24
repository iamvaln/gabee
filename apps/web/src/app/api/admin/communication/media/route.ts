import { MediaUploadInitSchema } from '@gabee/types';
import { json, readJson, requireAdmin } from '@/lib/server/http';
import { studioRoute } from '@/lib/server/content-studio/studio-http';
import { auditMedia, initUpload, listLibrary } from '@/lib/server/content-studio/media';

export const runtime = 'nodejs';

export const GET = studioRoute(async (req) => {
  await requireAdmin(req);
  const q = req.nextUrl.searchParams;
  const cleared = q.get('cleared');
  const assets = await listLibrary({
    kind: q.get('kind') ?? undefined,
    cleared: cleared === null ? undefined : cleared === 'true',
    aspect: q.get('aspect') ?? undefined,
    tag: q.get('tag') ?? undefined,
  });
  return json({ assets });
});

export const POST = studioRoute(async (req) => {
  const session = await requireAdmin(req);
  const input = await readJson(req, MediaUploadInitSchema);
  const out = await initUpload(input, session.parentId);
  await auditMedia(session.parentId, 'content.media.init', out.assetId, input);
  return json(out);
});
