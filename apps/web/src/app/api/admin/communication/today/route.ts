import { json } from '@/lib/server/http';
import { getStudioTimezone } from '@/lib/server/services/web-visits';
import { localParts } from '@/lib/server/content-studio/clock';
import { todayBoard } from '@/lib/server/content-studio/drafts';
import { getPublishLinks, type PublishContext } from '@/lib/server/content-studio/publish-links';
import { adminActor, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

// The Aujourd'hui board for the studio-local day, with the links the publish buttons open.
export const GET = studioRoute(async (req) => {
  const actor = await adminActor(req);
  const day = localParts(new Date(), await getStudioTimezone()).date;
  const [board, publishLinks] = await Promise.all([todayBoard(day), getPublishLinks()]);
  const publish: PublishContext = { publish_links: publishLinks, can_edit_settings: actor.role === 'super_admin' };
  return json({ ...board, ...publish });
});
