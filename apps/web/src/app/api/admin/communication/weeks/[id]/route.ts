import { json, requireAdmin } from '@/lib/server/http';
import { getWeek } from '@/lib/server/content-studio/weeks';
import { idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = studioRoute<Ctx>(async (req, ctx) => {
  await requireAdmin(req);
  return json({ week: await getWeek(await idParam(ctx)) });
});
