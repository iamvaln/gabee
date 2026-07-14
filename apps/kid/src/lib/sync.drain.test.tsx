import './../test/setup-dom'; // MUST be first: jsdom + fake-indexeddb
import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db';
import { api, ApiError } from './api';
import { SyncManager } from './sync';

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

function envelope(i: number) {
  // Shape per EventEnvelopeSchema (@gabee/types); uuid v4 from the browser crypto.
  return {
    event_id: crypto.randomUUID(),
    profile_id: null,
    session_id: null,
    client_ts: new Date(2026, 0, 1, 0, 0, i % 60).toISOString(),
    schema_version: 1,
    event: { name: 'app_open' },
  };
}

beforeEach(async () => {
  setOnline(true);
  mock.restoreAll();
  await db.events.clear();
  await db.progress.clear();
});

test('flush drains queued events in batches of ≤500 and deletes confirmed rows', async () => {
  const calls: number[] = [];
  mock.method(api, 'ingestEvents', async (envs: unknown[]) => {
    calls.push(envs.length);
    return { accepted: envs.length, duplicates: 0, rejected: [] };
  });
  mock.method(api, 'syncProgress', async () => ({}));
  await db.events.bulkAdd(Array.from({ length: 501 }, (_, i) => ({ envelope: envelope(i) })) as never);

  await new SyncManager().flush();

  assert.deepEqual(calls, [500, 1]); // two batches, capped at MAX_BATCH
  assert.equal(await db.events.count(), 0); // confirmed rows removed
});

test('duplicates and rejected are still removed from the queue (no re-send loop)', async () => {
  mock.method(api, 'ingestEvents', async (envs: { event_id: string }[]) => ({
    accepted: 0,
    duplicates: envs.length - 1,
    rejected: [envs[0]!.event_id],
  }));
  mock.method(api, 'syncProgress', async () => ({}));
  await db.events.bulkAdd([{ envelope: envelope(1) }, { envelope: envelope(2) }] as never);

  await new SyncManager().flush();

  assert.equal(await db.events.count(), 0);
});

test('transient failure keeps every row queued', async () => {
  mock.method(api, 'ingestEvents', async () => {
    throw new ApiError(500, 'boom', 'server exploded');
  });
  await db.events.bulkAdd([{ envelope: envelope(1) }, { envelope: envelope(2) }] as never);

  await new SyncManager().flush(); // swallows the error, schedules retry

  assert.equal(await db.events.count(), 2);
});

test('queueProgress keeps ONE row per profile (latest snapshot replaces)', async () => {
  setOnline(false); // block flushing so we can observe the queue itself
  const m = new SyncManager();
  const pid = crypto.randomUUID();
  await m.queueProgress({ profile_id: pid, total_stars: 1 } as never);
  await m.queueProgress({ profile_id: pid, total_stars: 7 } as never);

  const rows = await db.progress.toArray();
  assert.equal(rows.length, 1);
  assert.equal((rows[0]!.body as { total_stars: number }).total_stars, 7);
});

test('progress: 4xx (non-auth) drops the snapshot; 401 keeps it', async () => {
  mock.method(api, 'ingestEvents', async () => ({ accepted: 0, duplicates: 0, rejected: [] }));
  // drainProgress iterates db.progress.toArray() in ascending primary-key
  // (profile_id) order and ABORTS the remaining rows on the first non-permanent
  // failure (401/403/5xx — see sync.ts drainProgress). So p1 (422, permanently
  // rejected) must sort before p2 (401, kept) or p2's throw would stop the loop
  // before p1 is ever attempted. Sort two random UUIDs to pin that order
  // deterministically rather than relying on crypto.randomUUID() luck.
  const [p1, p2] = [crypto.randomUUID(), crypto.randomUUID()].sort();
  await db.progress.bulkPut([
    { profile_id: p1, body: { profile_id: p1 } },
    { profile_id: p2, body: { profile_id: p2 } },
  ] as never);
  mock.method(api, 'syncProgress', async (body: { profile_id: string }) => {
    if (body.profile_id === p1) throw new ApiError(422, 'invalid', 'permanently invalid');
    throw new ApiError(401, 'unauthorized', 'token expired');
  });

  await new SyncManager().flush();

  const left = await db.progress.toArray();
  assert.deepEqual(left.map((r) => r.profile_id), [p2]); // 422 dropped, 401 kept
});

test('flush while offline drains nothing and reports offline', async () => {
  setOnline(false);
  const ingest = mock.method(api, 'ingestEvents', async () => ({ accepted: 0, duplicates: 0, rejected: [] }));
  await db.events.add({ envelope: envelope(1) } as never);
  const m = new SyncManager();

  await m.flush();

  assert.equal(ingest.mock.callCount(), 0);
  assert.equal(await db.events.count(), 1);
  assert.equal(m.getStatus(), 'offline');
});
