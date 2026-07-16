import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import { grantGift, listPendingGifts, claimGift } from './gifts';
import { syncProgress } from './progress';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const randomUuid = '00000000-0000-0000-0000-000000000000';

test('grantGift creates a pending gift for a child; listPendingGifts(parentId, childId) returns it', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  const gift = await grantGift({ childId: child.id, amount: 5, label: 'Cadeau de fidélité' });

  assert.equal(gift.status, 'pending');
  assert.equal(gift.amount, 5);
  assert.equal(gift.label, 'Cadeau de fidélité');

  const pending = await listPendingGifts(parent.id, child.id);
  assert.equal(pending.gifts.length, 1);
  assert.equal(pending.gifts[0]!.id, gift.id);
  assert.equal(pending.gifts[0]!.status, 'pending');
});

test("listPendingGifts 404s when the child doesn't belong to the parent", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  await grantGift({ childId: child.id, amount: 5, label: 'Cadeau' });

  await assert.rejects(
    () => listPendingGifts(stranger.id, child.id),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'profile_not_found',
  );
});

test('claimGift by the OWNER moves the gift to claimed and adds the amount to total_stars', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const gift = await grantGift({ childId: child.id, amount: 12, label: 'Cadeau' });

  const res = await claimGift(parent.id, gift.id);

  assert.equal(res.status, 'claimed');
  assert.equal(res.amount, 12);
  assert.equal(res.total_stars, 12);

  const row = await prisma.kidGift.findUniqueOrThrow({ where: { id: gift.id } });
  assert.equal(row.status, 'claimed');
  assert.equal(row.amount, 12);
  assert.ok(row.claimedAt);
  assert.equal(row.claimedTotalStars, 12);

  const updatedChild = await prisma.childProfile.findUniqueOrThrow({ where: { id: child.id } });
  assert.equal(updatedChild.totalStars, 12);
});

test('claiming an already-claimed gift is idempotent — no double-add to total_stars', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const gift = await grantGift({ childId: child.id, amount: 7, label: 'Cadeau' });

  const first = await claimGift(parent.id, gift.id);
  const second = await claimGift(parent.id, gift.id);

  assert.equal(first.total_stars, 7);
  // Idempotent re-claim: same status/amount/total, not incremented again.
  assert.equal(second.status, 'claimed');
  assert.equal(second.amount, 7);
  assert.equal(second.total_stars, 7);

  const updatedChild = await prisma.childProfile.findUniqueOrThrow({ where: { id: child.id } });
  assert.equal(updatedChild.totalStars, 7, 'claiming twice must not add the amount twice');
});

test("a STRANGER parent cannot claim another family's gift", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const gift = await grantGift({ childId: child.id, amount: 9, label: 'Cadeau' });

  await assert.rejects(
    () => claimGift(stranger.id, gift.id),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'gift_not_found',
  );

  // Confirm no side effect: the gift is still pending and no stars were added.
  const row = await prisma.kidGift.findUniqueOrThrow({ where: { id: gift.id } });
  assert.equal(row.status, 'pending');
  const untouchedChild = await prisma.childProfile.findUniqueOrThrow({ where: { id: child.id } });
  assert.equal(untouchedChild.totalStars, 0);
});

test('claiming an unknown gift id 404s', async () => {
  const parent = await createParent(prisma);
  await createChild(prisma, { parentId: parent.id });

  await assert.rejects(
    () => claimGift(parent.id, randomUuid),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'gift_not_found',
  );
});

test('a claimed gift of amount N raises the star-evidence cap by N (ties gifts to the syncProgress evidence cap)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const gift = await grantGift({ childId: child.id, amount: 15, label: 'Cadeau' });

  // No event evidence at all — only the claimed gift backs the stars.
  await claimGift(parent.id, gift.id);

  const res = await syncProgress(parent.id, { profile_id: child.id, total_stars: 15 } as never);
  assert.equal(res.total_stars, 15, 'a claimed gift of amount N must count as N stars of evidence, not be clamped');
});
