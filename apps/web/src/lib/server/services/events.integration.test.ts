import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@gabee/types';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import { ingestEvents } from './events';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

function makeEnvelope(profileId: string | null, overrides: Record<string, unknown> = {}): EventEnvelope {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    session_id: randomUUID(),
    client_ts: new Date(2026, 0, 2, 10, 0, 0).toISOString(),
    schema_version: 1,
    event: { name: 'session_start', initiation_label: null },
    ...overrides,
  } as EventEnvelope;
}

test('replayed events are counted as duplicates, stored once (idempotency)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const env = makeEnvelope(child.id);

  const first = await ingestEvents(parent.id, [env]);
  const replay = await ingestEvents(parent.id, [env]);

  assert.equal(first.accepted, 1);
  assert.deepEqual({ accepted: replay.accepted, duplicates: replay.duplicates }, { accepted: 0, duplicates: 1 });
  assert.equal(await prisma.event.count({ where: { eventId: env.event_id } }), 1);
});

test("events for another parent's profile are rejected, others in the batch still land", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const mine = await createChild(prisma, { parentId: parent.id });
  const theirs = await createChild(prisma, { parentId: stranger.id });
  const ok = makeEnvelope(mine.id);
  const stolen = makeEnvelope(theirs.id);

  const res = await ingestEvents(parent.id, [ok, stolen]);

  assert.equal(res.accepted, 1);
  assert.deepEqual(res.rejected, [stolen.event_id]);
  assert.equal(await prisma.event.count(), 1);
});

test('session_start seeds the classification queue; session_end stamps duration', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const sessionId = randomUUID();

  await ingestEvents(parent.id, [
    makeEnvelope(child.id, { session_id: sessionId, event: { name: 'session_start', initiation_label: null, tz: 'Europe/Paris', tz_offset_min: 120 } }),
  ]);
  const seeded = await prisma.sessionClassification.findUniqueOrThrow({ where: { sessionId } });
  assert.equal(seeded.profileId, child.id);
  assert.equal(seeded.tz, 'Europe/Paris');

  await ingestEvents(parent.id, [
    makeEnvelope(child.id, { session_id: sessionId, event: { name: 'session_end', duration_s: 300, last_screen: 'summary' } }),
  ]);
  const closed = await prisma.sessionClassification.findUniqueOrThrow({ where: { sessionId } });
  assert.equal(closed.durationS, 300);
});
