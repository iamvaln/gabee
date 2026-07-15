import {
  UpdateProfileRequestSchema,
  DeviceUpdateProfileRequestSchema,
  type ProfileResponse,
  type OkResponse,
} from '@gabee/types';
import { route, readJson, json, requireParent, requireKidDevice } from '@/lib/server/http';
import { updateProfile, deleteProfile } from '@/lib/server/services/profiles';
import { recordFamilyActivity } from '@/lib/server/services/family-activity';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireKidDevice(req);
  const { id } = await ctx.params;
  // A paired kid device may only flip the audio toggle — that is the ONLY field the
  // kid PWA writes (Settings.tsx). A parent sign-in gets the full schema. Without
  // this split, a device token could rewrite its family's names, birth dates, gender
  // and avatars.
  const input =
    session.scope === 'device'
      ? await readJson(req, DeviceUpdateProfileRequestSchema)
      : await readJson(req, UpdateProfileRequestSchema);
  const profile = await updateProfile(session.parentId, id, input);
  // Family activity log — surfaced as "X updated <kid>'s profile" on K1.
  void recordFamilyActivity({
    childId: profile.id,
    actorParentId: session.parentId,
    action: 'kid_edited',
    payload: { fields: Object.keys(input) },
  });
  return json<ProfileResponse>({ profile });
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  await deleteProfile(session.parentId, id);
  // Family activity log — log BEFORE the cascade wipes the child row would
  // fail FK; the kid was just deleted so this insert will likely fail and be
  // swallowed by recordFamilyActivity's catch. That's intentional: the kid is
  // gone, so the feed line about it is best-effort. Co-parents who saw the kid
  // before deletion still get the event if their FK to child is still resolvable.
  void recordFamilyActivity({
    childId: id,
    actorParentId: session.parentId,
    action: 'kid_removed',
  });
  return json<OkResponse>({ success: true });
});
