import { ModuleSchema, LevelSchema, SavePlanRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin, HttpError } from '@/lib/server/http';
import { getPlan, savePlan } from '@/lib/server/services/admin-content';

export const runtime = 'nodejs';

function parseTarget(req: Request): {
  module: ReturnType<typeof ModuleSchema.parse>;
  subMode: string;
  level: number;
} {
  const url = new URL(req.url);
  const module = ModuleSchema.safeParse(url.searchParams.get('module'));
  const level = LevelSchema.safeParse(Number(url.searchParams.get('level')));
  const subMode = url.searchParams.get('sub_mode');
  if (!module.success || !level.success || !subMode) {
    throw new HttpError(400, 'invalid_target', 'Provide a valid ?module=, ?sub_mode= and ?level=');
  }
  return { module: module.data, subMode, level: level.data };
}

export const GET = route(async (req) => {
  await requireAdmin(req);
  const { module, subMode, level } = parseTarget(req);
  return json(await getPlan(module, subMode, level));
});

export const PUT = route(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req, SavePlanRequestSchema);
  return json({ plan: await savePlan(body) });
});
