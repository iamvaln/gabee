import { ChooseDirectionRequestSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { chooseDirection } from '@/lib/server/content-studio/weeks';
import { AI_REFUSED_DIRECTION, adminActor, idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';
// Waits for the Strategist to write the week's titles.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// "Arrêter cette direction": pick a proposal (+ refinement, per-platform angles) → the week's titles.
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const body = await readJson(req, ChooseDirectionRequestSchema);
  return json({ week: await chooseDirection(id, body, actor) });
}, { refused: AI_REFUSED_DIRECTION });
