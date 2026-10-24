import { UpdateDraftRequestSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { editDraft } from '@/lib/server/content-studio/drafts';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// "Modifier": a new owner version (text, hashtags, attached media). Unpins any approval.
export const PATCH = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const patch = await readJson(req, UpdateDraftRequestSchema);
  return json({ draft: await editDraft(id, patch, actor) });
});
