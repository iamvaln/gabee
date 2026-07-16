import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEnvelopeSchema, type EventEnvelope } from '@gabee/types';
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

// ─── code_level_solved emit → ingest fidelity ────────────────────────────────
//
// CodeTurtleSession (apps/kid/src/screens/CodeTurtleSession.tsx, the enqueueEvent
// call around line 416) fires this event once per solved puzzle:
//
//   { name: 'code_level_solved', level, lesson,
//     total_attempts: attemptsRef.current,
//     final_blocks_used: finalBlocksUsed, optimal_blocks: optimalBlocks,
//     efficiency_ratio: Math.min(1, optimalBlocks / finalBlocksUsed),
//     used_loop: false, used_conditional: false,
//     total_wall_hits: 0, hints_used: 0, duration_ms }
//
// enqueueEvent (apps/kid/src/lib/events.ts) wraps that payload in the envelope
// (event_id/profile_id/session_id/client_ts/schema_version) and the sync drain
// POSTs it to /api/events, which is LENIENT: it runs EventEnvelopeSchema.safeParse
// per item (route.ts) — malformed events are rejected by id, not thrown, so a
// schema-invalid emit would otherwise wedge the queue forever (drainEvents has no
// permanent-reject path). This block proves the real emitted shape survives that
// gate and lands in the DB, and that the gate isn't a rubber stamp.

/** A raw (untyped) envelope carrying a `code_level_solved` payload shaped exactly
 *  like CodeTurtleSession's enqueueEvent call — realistic values, not placeholders. */
function codeLevelSolvedRawEnvelope(
  profileId: string,
  sessionId: string,
  eventOverrides: Record<string, unknown> = {},
): unknown {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    session_id: sessionId,
    client_ts: new Date(2026, 0, 2, 10, 5, 0).toISOString(),
    schema_version: 1,
    event: {
      name: 'code_level_solved',
      level: 1,
      lesson: 1,
      total_attempts: 1,
      final_blocks_used: 3,
      optimal_blocks: 3,
      efficiency_ratio: 1,
      used_loop: false,
      used_conditional: false,
      total_wall_hits: 0,
      hints_used: 0,
      duration_ms: 4200,
      ...eventOverrides,
    },
  };
}

/** Mirrors /api/events' POST handler (apps/web/src/app/api/events/route.ts):
 *  safeParse each raw item, only valid envelopes reach ingestEvents. */
async function validateAndIngest(parentId: string, rawItems: unknown[]) {
  const valid: EventEnvelope[] = [];
  const schemaRejected: string[] = [];
  for (const item of rawItems) {
    const parsed = EventEnvelopeSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
    else schemaRejected.push((item as { event_id: string }).event_id);
  }
  const result = await ingestEvents(parentId, valid);
  return { ...result, rejected: [...result.rejected, ...schemaRejected] };
}

test('a real code_level_solved emit (CodeTurtleSession shape) validates and is accepted', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const sessionId = randomUUID();
  const raw = codeLevelSolvedRawEnvelope(child.id, sessionId);

  const res = await validateAndIngest(parent.id, [raw]);

  // If this fails, the emitted payload is schema-invalid — a real Task-2 bug
  // that would wedge the kid's sync queue in production, not a test bug.
  assert.equal(res.accepted, 1);
  assert.deepEqual(res.rejected, []);
  assert.equal(res.duplicates, 0);

  const stored = await prisma.event.findUniqueOrThrow({
    where: { eventId: (raw as { event_id: string }).event_id },
  });
  assert.equal(stored.name, 'code_level_solved');
  assert.equal(stored.profileId, child.id);
  assert.deepEqual(stored.payload, (raw as { event: unknown }).event);
});

test('a malformed code_level_solved (efficiency_ratio out of range) is rejected before ingestion', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const sessionId = randomUUID();
  // efficiency_ratio must be in [0, 1] (CodeLevelSolvedEvent, packages/types/src/events.ts) —
  // a client bug (e.g. optimal_blocks > final_blocks_used) could push it above 1.
  const raw = codeLevelSolvedRawEnvelope(child.id, sessionId, { efficiency_ratio: 1.5 });

  const res = await validateAndIngest(parent.id, [raw]);

  assert.equal(res.accepted, 0);
  assert.deepEqual(res.rejected, [(raw as { event_id: string }).event_id]);
  assert.equal(await prisma.event.count(), 0);
});

test('a malformed code_level_solved (missing required field) is rejected before ingestion', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const sessionId = randomUUID();
  const raw = codeLevelSolvedRawEnvelope(child.id, sessionId) as { event: Record<string, unknown> };
  delete raw.event.duration_ms; // required by CodeLevelSolvedEvent

  const res = await validateAndIngest(parent.id, [raw]);

  assert.equal(res.accepted, 0);
  assert.deepEqual(res.rejected, [(raw as unknown as { event_id: string }).event_id]);
  assert.equal(await prisma.event.count(), 0);
});
