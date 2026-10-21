import { z } from 'zod';
import { json, readJson } from '@/lib/server/http';
import { validateWeek } from '@/lib/server/content-studio/weeks';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/http-errors';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const ValidateSchema = z.object({ override_quota: z.boolean().optional() });

// "Valider la semaine". 409 `language_quota` below the English minimum unless `override_quota`
// (the body is optional: no body = no override).
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const body: z.infer<typeof ValidateSchema> = req.headers.get('content-type')?.includes('application/json') ? await readJson(req, ValidateSchema) : {};
  return json({ week: await validateWeek(id, actor, { overrideQuota: body.override_quota === true }) });
});
