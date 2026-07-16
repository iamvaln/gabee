import {
  CreateProfileRequestSchema,
  type ListProfilesResponse,
  type ProfileResponse,
} from '@gabee/types';
import { route, readJson, json, requireParent, requireKidDevice } from '@/lib/server/http';
import { listProfiles, createProfile } from '@/lib/server/services/profiles';
import { recordFamilyActivity } from '@/lib/server/services/family-activity';

export const runtime = 'nodejs';

// The kid PWA lists profiles to pick who's playing, so a paired device may GET…
export const GET = route(async (req) => {
  const session = await requireKidDevice(req);
  const profiles = await listProfiles(session.parentId);
  return json<ListProfilesResponse>({ profiles });
});

// …but creating a child is a parent action — device tokens are rejected here.
export const POST = route(async (req) => {
  const session = await requireParent(req);
  const input = await readJson(req, CreateProfileRequestSchema);
  const profile = await createProfile(session.parentId, input);
  // Family activity log — surfaced as "X added <kid>" on the K1 feed.
  void recordFamilyActivity({
    childId: profile.id,
    actorParentId: session.parentId,
    action: 'kid_added',
    payload: { name: profile.name, language: profile.language, avatar: profile.avatar },
  });
  return json<ProfileResponse>({ profile }, 201);
});
