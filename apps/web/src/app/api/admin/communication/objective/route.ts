import { ObjectiveUpsertSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { upsertObjective } from '@/lib/server/content-studio/settings';
import { studioRoute, superAdminActor } from '@/lib/server/content-studio/http-errors';

export const runtime = 'nodejs';

// Set the objective of a month (super_admin).
export const PUT = studioRoute(async (req) => {
  const actor = await superAdminActor(req);
  const body = await readJson(req, ObjectiveUpsertSchema);
  return json({ objective: await upsertObjective(body, actor) });
});
