import {
  CreateProfileRequestSchema,
  type ListProfilesResponse,
  type ProfileResponse,
} from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { listProfiles, createProfile } from '@/lib/server/services/profiles';
import { recordFamilyActivity } from '@/lib/server/services/family-activity';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  const session = await requireParent(req);
  const profiles = await listProfiles(session.parentId);
  return json<ListProfilesResponse>({ profiles });
});

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
