import { json, requireAdmin } from '@/lib/server/http';
import { getStudioTimezone } from '@/lib/server/services/web-visits';
import { localParts } from '@/lib/server/content-studio/clock';
import { todayBoard } from '@/lib/server/content-studio/drafts';
import { studioRoute } from '@/lib/server/content-studio/http-errors';

export const runtime = 'nodejs';

// The Aujourd'hui board for the studio-local day.
export const GET = studioRoute(async (req) => {
  await requireAdmin(req);
  const day = localParts(new Date(), await getStudioTimezone()).date;
  return json(await todayBoard(day));
});
