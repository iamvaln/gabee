import '../../../test/setup-integration';
import { randomUUID } from 'node:crypto';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createCurriculum, createQuestion } from '@gabee/db/testing';
import { listPendingChanges, publishModule } from './admin-publish';
import type { Prisma } from '@gabee/db';

const prisma = createTestClient();
const CURRICULUM_ID = randomUUID();
const ACTOR_ID = randomUUID(); // AuditLog.actorId is @db.Uuid — must be a real uuid.

beforeEach(async () => {
  await resetDb(prisma);
  await createCurriculum(prisma, { id: CURRICULUM_ID, isDefault: true });
});
after(async () => prisma.$disconnect());

function confirmedQuestion(id: string, overrides: Partial<Prisma.QuestionUncheckedCreateInput> = {}) {
  return createQuestion(prisma, {
    id,
    curriculumId: CURRICULUM_ID,
    module: 'numbers',
    status: 'confirmed',
    ...overrides,
  });
}

test('listPendingChanges: an unpublished module reports every confirmed question as added, current_* null/0', async () => {
  await confirmedQuestion('q-a');
  await confirmedQuestion('q-b');

  const changes = await listPendingChanges(CURRICULUM_ID);
  const numbers = changes.find((c) => c.module === 'numbers');

  assert.ok(numbers);
  assert.equal(numbers.current_version, null);
  assert.equal(numbers.current_question_count, 0);
  assert.deepEqual(numbers.pending.added, ['q-a', 'q-b'], 'confirmed-but-never-published are added');
  assert.deepEqual(numbers.pending.removed, []);
  assert.deepEqual(numbers.pending.modified, []);
  assert.equal(numbers.has_changes, true);
  // Every module is reported, even empty ones.
  assert.equal(changes.length, 5);
});

test('listPendingChanges: diff buckets added/removed/modified against the latest snapshot', async () => {
  // Snapshot v1 (published in the far past) contained q-keep (still confirmed) and
  // q-gone (since removed from the confirmed pool).
  const q = await confirmedQuestion('q-keep');
  await prisma.contentBundleVersion.create({
    data: {
      module: 'numbers',
      version: 1,
      publishedAt: new Date('2020-01-01T00:00:00.000Z'),
      questionCount: 2,
      questionIds: ['q-keep', 'q-gone'],
    },
  });
  // q-new is confirmed after the snapshot -> added.
  await confirmedQuestion('q-new');

  const changes = await listPendingChanges(CURRICULUM_ID);
  const numbers = changes.find((c) => c.module === 'numbers');

  assert.ok(numbers);
  assert.equal(numbers.current_version, 1);
  assert.deepEqual(numbers.pending.added, ['q-new'], 'confirmed since the snapshot');
  assert.deepEqual(numbers.pending.removed, ['q-gone'], 'in the snapshot but no longer confirmed');
  assert.deepEqual(
    numbers.pending.modified,
    ['q-keep'],
    'in both, and updatedAt (now) is after the 2020 snapshot publishedAt',
  );
  assert.equal(numbers.has_changes, true);
  // sanity: q-keep really is the modified one and it is still confirmed
  assert.equal(q.status, 'confirmed');
});

test('publishModule: mints v(latest+1) snapshotting the sorted confirmed ids, and writes a bundle.publish audit', async () => {
  await confirmedQuestion('q-b');
  await confirmedQuestion('q-a');

  const res = await publishModule(CURRICULUM_ID, 'numbers', ACTOR_ID, 'super_admin');

  assert.equal(res.module, 'numbers');
  assert.equal(res.version, 1);
  assert.equal(res.question_count, 2);

  const snapshot = await prisma.contentBundleVersion.findFirstOrThrow({
    where: { module: 'numbers', version: 1 },
  });
  assert.deepEqual(snapshot.questionIds, ['q-a', 'q-b'], 'ids are stored sorted');
  assert.equal(snapshot.questionCount, 2);

  const audit = await prisma.auditLog.findFirstOrThrow({ where: { kind: 'bundle.publish' } });
  assert.equal(audit.actorId, ACTOR_ID);
  assert.equal(audit.actorRole, 'super_admin');
  assert.equal(audit.targetKind, 'content_bundle_version');
  assert.equal(audit.targetId, 'numbers:1');
});

test('publishModule: a second publish increments to the next version', async () => {
  await confirmedQuestion('q-a');
  await publishModule(CURRICULUM_ID, 'numbers', ACTOR_ID, 'super_admin');

  await confirmedQuestion('q-c');
  const second = await publishModule(CURRICULUM_ID, 'numbers', ACTOR_ID, 'super_admin');

  assert.equal(second.version, 2);
  assert.equal(second.question_count, 2);
  const versions = await prisma.contentBundleVersion.findMany({
    where: { module: 'numbers' },
    orderBy: { version: 'asc' },
    select: { version: true },
  });
  assert.deepEqual(versions.map((v) => v.version), [1, 2]);
});

test('publishModule: a zero-change publish is allowed by design (bumps the version with an empty snapshot)', async () => {
  // No confirmed questions at all — the service does NOT block an empty publish.
  const res = await publishModule(CURRICULUM_ID, 'numbers', ACTOR_ID, 'super_admin');

  assert.equal(res.version, 1);
  assert.equal(res.question_count, 0);
  const snapshot = await prisma.contentBundleVersion.findFirstOrThrow({
    where: { module: 'numbers', version: 1 },
  });
  assert.deepEqual(snapshot.questionIds, []);
});
