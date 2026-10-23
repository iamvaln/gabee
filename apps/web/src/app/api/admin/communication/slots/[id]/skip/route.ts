import { SkipDayRequestSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { skipDay } from '@/lib/server/content-studio/weeks';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/http-errors';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// "Sauter" a day (with a reason): no drafts, no reminders.
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const { reason } = await readJson(req, SkipDayRequestSchema);
  return json({ slot: await skipDay(id, reason, actor) });
});
