import { z } from 'zod';
import { HttpError, json } from '@/lib/server/http';
import { validateWeek } from '@/lib/server/content-studio/weeks';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const ValidateSchema = z.object({ override_quota: z.boolean().optional() });

/**
 * The body is optional (no body = no override) and read whatever the content type:
 * an empty body is `{}`, anything else must be JSON matching the schema.
 */
async function readBody(req: Request): Promise<z.infer<typeof ValidateSchema>> {
  const text = await req.text();
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json', "La demande n'a pas pu être lue (JSON invalide). Rechargez la page puis réessayez.");
  }
  const parsed = ValidateSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, 'validation_error', 'Request failed validation', parsed.error.issues);
  return parsed.data;
}

// "Valider la semaine". 409 `language_quota` below the English minimum unless `override_quota`.
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const body = await readBody(req);
  return json({ week: await validateWeek(id, actor, { overrideQuota: body.override_quota === true }) });
});
