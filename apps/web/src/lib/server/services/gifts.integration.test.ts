import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createParent, createChild, seedCorrectAnswers } from '@gabee/db/testing';
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

test('a claimed gift widens the evidence cap ON TOP OF earned stars (isolates gifts in countEvidencedStars, above the grandfathered floor)', async () => {
  // This test must fail if `gifted` is dropped from countEvidencedStars. The
  // naive setup (claim a gift, then sync total_stars == gift amount) does NOT
  // prove that: claimGift bumps the row to the gift amount, so syncProgress's
  // grandfather branch (cur.total_stars > cap) absorbs it and returns that total
  // whether or not the gift is counted. To isolate the gift's contribution we
  // keep the synced claim ABOVE the row's current total, backed by BOTH earned
  // events and the gift — so only counting the gift lets the cap reach the claim.
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  // Claim a gift of 5 -> the child row is bumped to 5 (the grandfathered floor).
  const gift = await grantGift({ childId: child.id, amount: 5, label: 'Cadeau' });
  await claimGift(parent.id, gift.id);

  // Independently earn 5 stars of real event evidence, not yet reflected in the row.
  await seedCorrectAnswers(prisma, child.id, 5);

  // Client syncs 10 (= 5 earned + 5 gifted), above the grandfathered floor of 5.
  // WITH the gift counted:    cap = 5 earned + 5 gifted = 10 -> allowed to 10.
  // WITHOUT the gift counted: cap = 5 earned; cur(5) is not > 5 so no grandfather
  //                           top-up, and the claim clamps back to 5.
  const res = await syncProgress(parent.id, { profile_id: child.id, total_stars: 10 } as never);
  assert.equal(
    res.total_stars,
    10,
    'the gift amount must widen the evidence cap on top of earned stars, not be masked by the grandfathered floor',
  );
});
