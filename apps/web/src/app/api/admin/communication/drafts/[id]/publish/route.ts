import { MarkPublishedRequestSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { markPublished } from '@/lib/server/content-studio/drafts';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/http-errors';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// "Marquer comme publié": the post URL, an optional 1–5 rating and comment.
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const body = await readJson(req, MarkPublishedRequestSchema);
  return json({ draft: await markPublished(id, body, actor) });
});
