import '../../../test/setup-integration'; // src/app/api/events -> src/test (3 dirs up from events/)
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import { parentToken, authedRequest } from '../../../test/auth';
import { POST } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

function validEnvelope(profileId: string) {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    session_id: randomUUID(),
    client_ts: new Date(2026, 0, 2, 11, 0, 0).toISOString(),
    schema_version: 1,
    event: { name: 'session_start', initiation_label: null },
  };
}

test('lenient batch: one malformed event is rejected by id, the valid one lands (200, not 422)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const token = await parentToken(parent.id, parent.email);
  const good = validEnvelope(child.id);
  const badId = randomUUID();
  const bad = { event_id: badId, event: { name: 'not_a_real_event' } }; // fails EventEnvelopeSchema

  const res = await POST(authedRequest('http://localhost/api/events', token, { events: [good, bad] }), undefined);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.accepted, 1);
  assert.ok(body.rejected.includes(badId));
  assert.equal(await prisma.event.count({ where: { eventId: good.event_id } }), 1);
  assert.equal(await prisma.event.count(), 1); // malformed event not persisted
});

test('unauthenticated ingestion is refused with 401', async () => {
  const res = await POST(authedRequest('http://localhost/api/events', null, { events: [] }), undefined);
  assert.equal(res.status, 401);
});
