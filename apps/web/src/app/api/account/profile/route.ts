import { z } from 'zod';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { updateProfile } from '@/lib/server/services/parent-account';

export const runtime = 'nodejs';

// Phase 1 profile patch (parent spec §10.1). Only `display_name_for_kids` is
// persisted — the spec also mentions first/last name, country and ui_language
// but those columns are pending Phase 2.x; the form disables them client-side.
const ProfilePatchSchema = z.object({
  display_name_for_kids: z.string().min(1).max(50),
});

export const PATCH = route(async (req) => {
  const session = await requireParent(req);
  const input = await readJson(req, ProfilePatchSchema);
  const account = await updateProfile(session.parentId, input);
  return json(account);
});
