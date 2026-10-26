import { PublishLinksUpdateSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { updatePublishLinks } from '@/lib/server/content-studio/publish-links';
import { studioRoute, superAdminActor } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

// Réglages « Liens de publication »: only a super_admin changes them (any admin reads them in GET /settings).
export const PATCH = studioRoute(async (req) => {
  const actor = await superAdminActor(req);
  const patch = await readJson(req, PublishLinksUpdateSchema);
  return json({ publish_links: await updatePublishLinks(patch, actor) });
});
