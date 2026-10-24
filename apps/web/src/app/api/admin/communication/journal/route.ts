import { json, requireAdmin } from '@/lib/server/http';
import { studioJournal } from '@/lib/server/content-studio/journal';
import { studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

// The last scheduler jobs and agent runs, newest first, with their errors and costs.
export const GET = studioRoute(async (req) => {
  await requireAdmin(req);
  return json(await studioJournal());
});
