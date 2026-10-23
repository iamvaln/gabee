import { StudioSettingsUpdateSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { getSettings, updateSettings } from '@/lib/server/content-studio/settings';
import { adminActor, studioRoute, superAdminActor } from '@/lib/server/content-studio/http-errors';

export const runtime = 'nodejs';

// Réglages: any admin reads (read-only unless `can_edit`); only a super_admin changes them.
export const GET = studioRoute(async (req) => {
  const actor = await adminActor(req);
  return json({ ...(await getSettings(new Date())), can_edit: actor.role === 'super_admin' });
});

export const PATCH = studioRoute(async (req) => {
  const actor = await superAdminActor(req);
  const patch = await readJson(req, StudioSettingsUpdateSchema);
  return json({ settings: await updateSettings(patch, actor) });
});
