import { z } from 'zod';
import { json } from '@/lib/server/http';
import { validateWeek } from '@/lib/server/content-studio/weeks';
import { adminActor, idParam, readOptionalJson, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// Optional body (no body = no override); when present it must be JSON (see readOptionalJson).
const ValidateSchema = z.object({ override_quota: z.boolean().optional() });

// "Valider la semaine". 409 `language_quota` below the English minimum unless `override_quota`.
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const body = await readOptionalJson(req, ValidateSchema);
  return json({ week: await validateWeek(id, actor, { overrideQuota: body.override_quota === true }) });
});
