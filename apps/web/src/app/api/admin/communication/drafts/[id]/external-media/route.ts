import { ExternalMediaRequestSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { setExternalMedia } from '@/lib/server/content-studio/drafts';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// « J'utilise ma propre vidéo / mon propre média »: on (with an optional note) or off. Audited.
export const PUT = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const body = await readJson(req, ExternalMediaRequestSchema);
  return json({ draft: await setExternalMedia(id, body, actor) });
});
