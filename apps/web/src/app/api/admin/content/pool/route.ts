import { ModuleSchema, LevelSchema } from '@gabee/types';
import { route, json, requireAdmin, HttpError } from '@/lib/server/http';
import { getPool } from '@/lib/server/services/admin-content';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  await requireAdmin(req);
  const url = new URL(req.url);
  const module = ModuleSchema.safeParse(url.searchParams.get('module'));
  const level = LevelSchema.safeParse(Number(url.searchParams.get('level')));
  if (!module.success || !level.success) {
    throw new HttpError(400, 'invalid_target', 'Provide a valid ?module= and ?level=');
  }
  return json(await getPool(module.data, level.data));
});
