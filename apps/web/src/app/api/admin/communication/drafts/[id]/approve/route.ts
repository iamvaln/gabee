import { json } from '@/lib/server/http';
import { approveDraft } from '@/lib/server/content-studio/drafts';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/http-errors';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// "Valider" the current version. 409 `video_required` / `media_not_cleared` when the media is not usable.
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  return json({ draft: await approveDraft(id, actor) });
});
