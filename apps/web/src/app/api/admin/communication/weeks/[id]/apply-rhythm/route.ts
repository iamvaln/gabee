import { json } from '@/lib/server/http';
import { applyRhythm, planRhythm } from '@/lib/server/content-studio/rhythm';
import { idParam, studioRoute, superAdminActor } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// « Appliquer le rythme à la semaine en cours »: what it would change (the confirm dialog's summary) …
export const GET = studioRoute<Ctx>(async (req, ctx) => {
  await superAdminActor(req);
  const id = await idParam(ctx);
  return json({ plan: await planRhythm(id, new Date()) });
});

// … and the change itself, on the validated week's future days (super-admin, like the cadence in Réglages).
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await superAdminActor(req);
  const id = await idParam(ctx);
  return json(await applyRhythm(id, actor, new Date()));
});
