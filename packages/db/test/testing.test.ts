import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestClient,
  resetDb,
  createParent,
  createChild,
  createCurriculum,
  createQuestion,
  createDevice,
} from '../src/testing';

const prisma = createTestClient();

before(async () => {
  await resetDb(prisma);
});
beforeEach(async () => {
  await resetDb(prisma);
});
after(async () => {
  await prisma.$disconnect();
});

test('createParent → unique emails, default parent role', async () => {
  const a = await createParent(prisma);
  const b = await createParent(prisma);
  assert.notEqual(a.email, b.email);
  assert.equal(a.role, 'parent');
});

test('createChild auto-creates a parent and links to it', async () => {
  const child = await createChild(prisma);
  const found = await prisma.childProfile.findUniqueOrThrow({
    where: { id: child.id },
    include: { parent: true },
  });
  assert.equal(found.parent.id, child.parentId);
  assert.equal(found.language, 'fr');
});

test('createChild respects an explicit parentId', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  assert.equal(child.parentId, parent.id);
});

test('createQuestion auto-creates a curriculum; overrides win', async () => {
  const q = await createQuestion(prisma, { module: 'words', level: 3 });
  assert.equal(q.module, 'words');
  assert.equal(q.level, 3);
  const cur = await prisma.curriculum.findUniqueOrThrow({ where: { id: q.curriculumId } });
  assert.ok(cur.id);
});

test('createDevice auto-creates a parent', async () => {
  const device = await createDevice(prisma);
  const parent = await prisma.parentAccount.findUniqueOrThrow({ where: { id: device.parentId } });
  assert.ok(parent.id);
});

test('createCurriculum creates a row', async () => {
  const cur = await createCurriculum(prisma);
  assert.equal(await prisma.curriculum.count({ where: { id: cur.id } }), 1);
});

test('resetDb truncates everything except _prisma_migrations', async () => {
  await createChild(prisma);
  await createQuestion(prisma);
  await resetDb(prisma);
  assert.equal(await prisma.parentAccount.count(), 0);
  assert.equal(await prisma.childProfile.count(), 0);
  assert.equal(await prisma.question.count(), 0);
  // migrations table untouched — the client still works against a migrated schema
  const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM _prisma_migrations
  `;
  assert.ok(count > 0n);
});
