import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import { defaultProgressByModule } from '@gabee/types';
import { syncProgress } from './progress';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

function numbersProgress(stars: number, highestLevel: number) {
  const p = defaultProgressByModule();
  p.numbers.highest_level = highestLevel;
  p.numbers.levels = [
    {
      level: 1,
      stars,
      plays: 1,
      best_time_s: null,
      last_played: new Date(2026, 0, 1).toISOString(),
      seen_question_ids: [`q-${stars}`],
      lessons: [{ lesson: 1, stars, plays: 1, last_played: new Date(2026, 0, 1).toISOString() }],
    },
  ];
  return p;
}

test('a stale device can never regress progress (monotonic merge)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  await syncProgress(parent.id, { profile_id: child.id, total_stars: 10, progress_by_module: numbersProgress(10, 3) } as never);
  const res = await syncProgress(parent.id, { profile_id: child.id, total_stars: 4, progress_by_module: numbersProgress(4, 1) } as never);

  assert.equal(res.total_stars, 10); // max, not clobber
  assert.equal(res.progress_by_module.numbers.highest_level, 3);
  assert.equal(res.progress_by_module.numbers.levels[0]!.stars, 10);
  // seen ids are a union — both devices' history is kept
  assert.deepEqual([...res.progress_by_module.numbers.levels[0]!.seen_question_ids].sort(), ['q-10', 'q-4']);
});

test('badges are a union — a stale device cannot strip an earned badge', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id, badges: ['first_star'] });

  const res = await syncProgress(parent.id, { profile_id: child.id, badges: ['week_streak'] } as never);

  assert.deepEqual([...res.badges].sort(), ['first_star', 'week_streak']);
});

test('two concurrent device syncs both land (row lock serializes the merge)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  await Promise.all([
    syncProgress(parent.id, { profile_id: child.id, total_stars: 5, badges: ['a'] } as never),
    syncProgress(parent.id, { profile_id: child.id, total_stars: 8, badges: ['b'] } as never),
  ]);

  const row = await prisma.childProfile.findUniqueOrThrow({ where: { id: child.id } });
  assert.equal(row.totalStars, 8);
  assert.deepEqual([...row.badges].sort(), ['a', 'b']);
});

test('replaying the same snapshot is idempotent', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const body = { profile_id: child.id, total_stars: 6, progress_by_module: numbersProgress(6, 2) };

  const first = await syncProgress(parent.id, body as never);
  const second = await syncProgress(parent.id, body as never);

  assert.deepEqual(second.progress_by_module, first.progress_by_module);
  assert.equal(second.total_stars, first.total_stars);
});

test("syncing another parent's child 404s", async () => {
  const owner = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: owner.id });

  await assert.rejects(
    () => syncProgress(stranger.id, { profile_id: child.id, total_stars: 1 } as never),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
});
