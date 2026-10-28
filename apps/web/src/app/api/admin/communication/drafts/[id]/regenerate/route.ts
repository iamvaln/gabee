import { RegenerateRequestSchema } from '@gabee/types';
import { json } from '@/lib/server/http';
import { regenerateDraft } from '@/lib/server/content-studio/drafts';
import { adminActor, idParam, readOptionalJson, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';
// Waits for the writer and the Art director.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// "Régénérer" / "Réessayer"; « Régénérer avec une consigne » sends `{ instruction }` (no body: none).
// A failed generation answers 200 with the draft `failed` and its reason.
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const { instruction } = await readOptionalJson(req, RegenerateRequestSchema);
  return json({ draft: await regenerateDraft(id, actor, { instruction }) });
});
