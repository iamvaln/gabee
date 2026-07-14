import './../test/setup-dom';
import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db';
import { api, ApiError } from './api';
import { SyncManager } from './sync';

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(async () => {
  setOnline(true);
  mock.restoreAll();
  mock.timers.reset();
  await db.events.clear();
  await db.progress.clear();
});

test('exponential backoff: retries at 2s, then 4s, capped growth', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fail = true;
  const ingest = t.mock.method(api, 'ingestEvents', async () => {
    if (fail) throw new ApiError(500, 'boom', 'transient');
    return { accepted: 1, duplicates: 0, rejected: [] };
  });
  t.mock.method(api, 'syncProgress', async () => ({}));
  await db.events.add({ envelope: { event_id: crypto.randomUUID(), profile_id: null, session_id: null, client_ts: new Date(2026, 0, 1).toISOString(), schema_version: 1, event: { name: 'app_open' } } } as never);
  const m = new SyncManager();

  await m.flush(); // failure #1 → retry in 2s
  assert.equal(ingest.mock.callCount(), 1);

  t.mock.timers.tick(1_999);
  assert.equal(ingest.mock.callCount(), 1); // not yet
  t.mock.timers.tick(1);
  await Promise.resolve(); // let the retry flush start
  await new Promise((r) => setImmediate(r)); // and finish its async chain
  assert.equal(ingest.mock.callCount(), 2); // failure #2 → retry in 4s

  t.mock.timers.tick(3_999);
  await new Promise((r) => setImmediate(r));
  assert.equal(ingest.mock.callCount(), 2);
  fail = false;
  t.mock.timers.tick(1);
  await new Promise((r) => setImmediate(r));
  assert.equal(ingest.mock.callCount(), 3); // recovered
  assert.equal(await db.events.count(), 0);
});

test('single-flight: concurrent flush calls coalesce into one drain', async () => {
  let resolveIngest!: () => void;
  const gate = new Promise<void>((r) => (resolveIngest = r));
  const ingest = mock.method(api, 'ingestEvents', async () => {
    await gate;
    return { accepted: 1, duplicates: 0, rejected: [] };
  });
  mock.method(api, 'syncProgress', async () => ({}));
  await db.events.add({ envelope: { event_id: crypto.randomUUID(), profile_id: null, session_id: null, client_ts: new Date(2026, 0, 1).toISOString(), schema_version: 1, event: { name: 'app_open' } } } as never);
  const m = new SyncManager();

  const first = m.flush();
  const second = m.flush(); // must return immediately (inFlight)
  await second;
  // `second` resolves as soon as the sync inFlight-guard returns — before `first`'s
  // dexie/fake-indexeddb read has had a chance to progress to the ingestEvents call.
  // One extra tick lets that in-flight chain advance without a real setTimeout sleep.
  await new Promise((r) => setImmediate(r));
  assert.equal(ingest.mock.callCount(), 1);
  resolveIngest();
  await first;
  assert.equal(ingest.mock.callCount(), 1);
});

test('syncNow reports offline / busy / success with pending count', async () => {
  mock.method(api, 'ingestEvents', async () => ({ accepted: 2, duplicates: 0, rejected: [] }));
  mock.method(api, 'syncProgress', async () => ({}));
  const m = new SyncManager();

  setOnline(false);
  assert.deepEqual(await m.syncNow(), { ok: false, sentEvents: 0, reason: 'offline' });

  setOnline(true);
  await db.events.bulkAdd([
    { envelope: { event_id: crypto.randomUUID(), profile_id: null, session_id: null, client_ts: new Date(2026, 0, 1).toISOString(), schema_version: 1, event: { name: 'app_open' } } },
    { envelope: { event_id: crypto.randomUUID(), profile_id: null, session_id: null, client_ts: new Date(2026, 0, 1).toISOString(), schema_version: 1, event: { name: 'app_open' } } },
  ] as never);
  const res = await m.syncNow();
  assert.equal(res.ok, true);
  assert.equal(res.sentEvents, 2);
});

test('status: syncing while draining, synced flash after a real push, then online', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(api, 'ingestEvents', async () => ({ accepted: 1, duplicates: 0, rejected: [] }));
  t.mock.method(api, 'syncProgress', async () => ({}));
  await db.events.add({ envelope: { event_id: crypto.randomUUID(), profile_id: null, session_id: null, client_ts: new Date(2026, 0, 1).toISOString(), schema_version: 1, event: { name: 'app_open' } } } as never);
  const m = new SyncManager();
  const seen: string[] = [];
  m.subscribe((s) => seen.push(s));

  await m.flush();
  assert.deepEqual(seen.slice(0, 3), ['online', 'syncing', 'synced']);
  t.mock.timers.tick(2_000);
  assert.equal(m.getStatus(), 'online');
});
