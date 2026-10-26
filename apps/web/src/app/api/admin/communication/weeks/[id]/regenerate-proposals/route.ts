import { json } from '@/lib/server/http';
import { regenerateProposals } from '@/lib/server/content-studio/weeks';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';
// Waits for the Strategist's 3 new directions.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// "Régénérer les propositions": start a week not yet validated over (new directions, current objective).
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  return json({ week: await regenerateProposals(id, actor) });
});
