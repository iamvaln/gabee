import { EditorialLineUpdateSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { publishEditorialLine } from '@/lib/server/content-studio/settings';
import { studioRoute, superAdminActor } from '@/lib/server/content-studio/http-errors';

export const runtime = 'nodejs';

// Publish a new editorial line version (super_admin); earlier versions stay as history.
export const POST = studioRoute(async (req) => {
  const actor = await superAdminActor(req);
  const body = await readJson(req, EditorialLineUpdateSchema);
  return json({ editorial_line: await publishEditorialLine(body, actor) });
});
