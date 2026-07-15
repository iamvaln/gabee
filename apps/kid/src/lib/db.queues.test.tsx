import './../test/setup-dom';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db';

beforeEach(async () => {
  await db.events.clear();
  await db.progress.clear();
});

test('events queue preserves insertion order via auto-increment id', async () => {
  await db.events.bulkAdd([
    { envelope: { event_id: 'a' } },
    { envelope: { event_id: 'b' } },
    { envelope: { event_id: 'c' } },
  ] as never);
  const rows = await db.events.orderBy('id').toArray();
  assert.deepEqual(rows.map((r) => (r.envelope as { event_id: string }).event_id), ['a', 'b', 'c']);
});

test('progress table is keyed by profile_id — put replaces, delete removes', async () => {
  await db.progress.put({ profile_id: 'p1', body: { profile_id: 'p1', total_stars: 1 } } as never);
  await db.progress.put({ profile_id: 'p1', body: { profile_id: 'p1', total_stars: 9 } } as never);
  await db.progress.put({ profile_id: 'p2', body: { profile_id: 'p2', total_stars: 3 } } as never);
  assert.equal(await db.progress.count(), 2);

  await db.progress.delete('p1');
  const left = await db.progress.toArray();
  assert.deepEqual(left.map((r) => r.profile_id), ['p2']);
});

test('bulkDelete removes exactly the given ids and leaves the rest', async () => {
  await db.events.bulkAdd([{ envelope: { event_id: 'a' } }, { envelope: { event_id: 'b' } }, { envelope: { event_id: 'c' } }] as never);
  const rows = await db.events.orderBy('id').toArray();
  await db.events.bulkDelete(rows.slice(0, 2).map((r) => r.id));
  const left = await db.events.toArray();
  assert.deepEqual(left.map((r) => (r.envelope as { event_id: string }).event_id), ['c']);
});
