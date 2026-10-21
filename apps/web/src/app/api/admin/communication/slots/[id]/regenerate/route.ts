import { json } from '@/lib/server/http';
import { afterSlotChange, regenerateSlot } from '@/lib/server/content-studio/weeks';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/http-errors';

export const runtime = 'nodejs';
// Waits for the Strategist (and, on a due validated day, the writers).
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// "Régénérer" a day line.
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  await regenerateSlot(id, actor);
  return json(await afterSlotChange(id, actor, new Date()));
});
