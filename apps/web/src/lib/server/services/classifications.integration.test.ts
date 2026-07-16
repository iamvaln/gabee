import '../../../test/setup-integration'; // src/lib/server/services -> src/test (3 dirs up)
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import { classifySessions } from './classifications';

// BUG B (double-submit race, findings.md): the client's ~260ms re-enable
// window lets a second click re-POST the same session_id before the queue
// advances. The server must be idempotent so that racing 2nd submit is a
// no-op — no label overwrite, no duplicate family_activity_log entry (the
// route only logs when classifySessions returns a non-empty result).
const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('re-classifying an already-classified session is a no-op (idempotent)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const sessionId = randomUUID();
  await prisma.sessionClassification.create({
    data: { sessionId, profileId: child.id, startedAt: new Date(), label: null },
  });

  const first = await classifySessions(parent.id, [{ session_id: sessionId, label: 'child_initiated' }], null);
  assert.equal(first.length, 1); // first submit lands

  const second = await classifySessions(parent.id, [{ session_id: sessionId, label: 'prompted' }], null);
  assert.equal(second.length, 0); // second submit is a no-op — nothing re-classified

  const row = await prisma.sessionClassification.findUniqueOrThrow({ where: { sessionId } });
  assert.equal(row.label, 'child_initiated'); // label NOT overwritten by the racing 2nd submit
});
