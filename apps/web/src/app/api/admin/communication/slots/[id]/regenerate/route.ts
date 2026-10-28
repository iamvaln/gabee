import { RegenerateRequestSchema } from '@gabee/types';
import { json } from '@/lib/server/http';
import { afterSlotChange, regenerateSlot } from '@/lib/server/content-studio/weeks';
import { adminActor, idParam, readOptionalJson, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';
// Waits for the Strategist (and, on a due validated day, the writers).
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// "Régénérer" a day line; « Régénérer avec une consigne » sends `{ instruction }` (no body: none).
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const { instruction } = await readOptionalJson(req, RegenerateRequestSchema);
  await regenerateSlot(id, actor, { instruction });
  return json(await afterSlotChange(id, actor, new Date()));
});
