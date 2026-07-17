import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createParent } from '@gabee/db/testing';
import {
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  requestProfileIncrease,
} from './profiles';
import { HttpError } from '../http';
import type { CreateProfileRequest } from '@gabee/types';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

// createProfile requires `name` + `language`; every other field is optional
// and server-defaulted (see profiles.ts / CreateProfileRequestSchema).
function childInput(name: string): CreateProfileRequest {
  return { name, language: 'fr' };
}

test('createProfile creates an owned child; listProfiles is scoped to the parent', async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);

  const child = await createProfile(parent.id, childInput('Ada'));

  assert.equal(child.name, 'Ada');

  const parentProfiles = await listProfiles(parent.id);
  assert.equal(parentProfiles.length, 1);
  assert.equal(parentProfiles[0]!.id, child.id);

  // A stranger parent's own list is scoped to their own children — none here.
  assert.deepEqual(await listProfiles(stranger.id), []);
});

test("a stranger parent cannot update or delete another parent's child", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createProfile(parent.id, childInput('Ada'));

  await assert.rejects(
    () => updateProfile(stranger.id, child.id, { name: 'Hijacked' }),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'profile_not_found',
  );
  await assert.rejects(
    () => deleteProfile(stranger.id, child.id),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'profile_not_found',
  );

  // Confirm neither call had any side effect on the real row.
  const stillThere = await listProfiles(parent.id);
  assert.equal(stillThere.length, 1);
  assert.equal(stillThere[0]!.name, 'Ada');
});

test('the owner can update and delete their own child', async () => {
  const parent = await createParent(prisma);
  const child = await createProfile(parent.id, childInput('Ada'));

  const updated = await updateProfile(parent.id, child.id, { name: 'Ada Renamed' });
  assert.equal(updated.name, 'Ada Renamed');

  await deleteProfile(parent.id, child.id);
  assert.deepEqual(await listProfiles(parent.id), []);
});

test('a parent can create at most 3 profiles (MAX_CHILDREN); the 4th is rejected with 409', async () => {
  const parent = await createParent(prisma);
  await createProfile(parent.id, childInput('Kid 1'));
  await createProfile(parent.id, childInput('Kid 2'));
  await createProfile(parent.id, childInput('Kid 3'));

  await assert.rejects(
    () => createProfile(parent.id, childInput('Kid 4')),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'too_many_children',
  );

  assert.equal((await listProfiles(parent.id)).length, 3);
});

test('requestProfileIncrease files an admin Inbox request but does not itself lift the cap', async () => {
  const parent = await createParent(prisma);
  await createProfile(parent.id, childInput('Kid 1'));
  await createProfile(parent.id, childInput('Kid 2'));
  await createProfile(parent.id, childInput('Kid 3'));

  await requestProfileIncrease(parent.id);

  const messages = await prisma.inboxMessage.findMany({ where: { source: 'profile_increase_request' } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.email, parent.email);
  assert.match(messages[0]!.message, /Kid 1, Kid 2, Kid 3/);

  // No auto-grant: this only creates a trackable admin request, so the cap
  // still rejects a 4th profile until an operator manually raises it.
  await assert.rejects(
    () => createProfile(parent.id, childInput('Kid 4')),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'too_many_children',
  );
});

test('requestProfileIncrease 404s for an unknown parent id', async () => {
  await assert.rejects(
    () => requestProfileIncrease('00000000-0000-0000-0000-000000000000'),
    (e: unknown) => e instanceof HttpError && e.status === 404,
  );
});
