import { json, requireAdmin } from '@/lib/server/http';
import { getStudioTimezone } from '@/lib/server/services/web-visits';
import { localParts } from '@/lib/server/content-studio/clock';
import { pendingCounts } from '@/lib/server/content-studio/notify';
import { studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

// What waits for the owner today (studio-local): the admin nav badge.
export const GET = studioRoute(async (req) => {
  await requireAdmin(req);
  const day = localParts(new Date(), await getStudioTimezone()).date;
  return json(await pendingCounts(day));
});
