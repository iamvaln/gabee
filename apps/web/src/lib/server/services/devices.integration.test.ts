import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../test/factories';
import { createPairToken, claimPairToken, claimByCode, listDevices, revokeDevice } from './devices';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('pair-link claim creates a DeviceLink and is single-use (replay → 4xx)', async () => {
  const { parent } = await createLoginableParent(prisma);
  const { pair_url } = await createPairToken({ parentId: parent.id, label: 'iPad' });
  const token = new URL(pair_url).searchParams.get('pair')!; // token carried as ?pair=<jwt>

  const claimed = await claimPairToken({ token });
  assert.ok(claimed.token); // device bearer minted
  const { devices } = await listDevices(parent.id);
  assert.equal(devices.length, 1);

  await assert.rejects(() => claimPairToken({ token }), (e: unknown) => e instanceof HttpError && e.status >= 400);
});

test('claim-by-code binds to the owning parent; a stranger parent + same code → 404', async () => {
  const { parent } = await createLoginableParent(prisma);
  const stranger = await createLoginableParent(prisma);
  const { short_code } = await createPairToken({ parentId: parent.id, label: 'Tablet' });

  await assert.rejects(
    () => claimByCode({ parentId: stranger.parent.id, rawCode: short_code }),
    (e: unknown) => e instanceof HttpError && e.status === 404,
  );
  const ok = await claimByCode({ parentId: parent.id, rawCode: short_code });
  assert.ok(ok.token);
});

test('claim-by-code with a malformed code → 400', async () => {
  const { parent } = await createLoginableParent(prisma);
  await assert.rejects(
    () => claimByCode({ parentId: parent.id, rawCode: 'nope' }),
    (e: unknown) => e instanceof HttpError && e.status === 400,
  );
});

test('revoke removes a device from the active list and is owner-gated', async () => {
  const { parent } = await createLoginableParent(prisma);
  const stranger = await createLoginableParent(prisma);
  const { pair_url } = await createPairToken({ parentId: parent.id, label: 'Phone' });
  const token = new URL(pair_url).searchParams.get('pair')!;
  const claimed = await claimPairToken({ token });
  const deviceId = (await listDevices(parent.id)).devices[0]!.id;

  await assert.rejects(
    () => revokeDevice(stranger.parent.id, deviceId),
    (e: unknown) => e instanceof HttpError && e.status === 403,
  );
  await revokeDevice(parent.id, deviceId);
  assert.equal((await listDevices(parent.id)).devices.length, 0);
});
