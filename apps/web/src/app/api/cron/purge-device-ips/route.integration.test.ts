import '../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, createMediaAsset, resetDb } from '@gabee/db/testing';

// env.ts reads CRON_SECRET at import time: set it before loading the route.
const SECRET = 'test-cron-secret-0123456789abcdef0123456789';
process.env.CRON_SECRET = SECRET;
const { POST } = await import('./route');
const { webRequest } = await import('../../../../test/auth');

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const URL = 'http://web:3000/api/cron/purge-device-ips';
const call = (bearer?: string) => POST(webRequest(URL, bearer ? { bearer } : {}), { params: Promise.resolve({}) } as never);

test('purge route rejects a wrong secret and deletes nothing', async () => {
  await prisma.webVisit.create({
    data: { day: new Date('2020-01-01T00:00:00Z'), path: '/fr', deviceClass: 'desktop', source: 'direct' },
  });
  const res = await call('not-the-secret');
  assert.equal(res.status, 401);
  assert.equal(await prisma.webVisit.count(), 1);
});

test('purge route returns both the device-IP and the web-visits summaries', async () => {
  const today = new Date();
  await prisma.webVisit.create({
    data: { day: new Date('2020-01-01T00:00:00Z'), path: '/fr', deviceClass: 'desktop', source: 'direct' },
  });
  await prisma.webVisit.create({
    data: { day: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), path: '/fr', deviceClass: 'desktop', source: 'direct' },
  });
  const res = await call(SECRET);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.summary.device_ips.retention_days, 90);
  assert.equal(typeof body.summary.device_ips.sightings_deleted, 'number');
  assert.equal(body.summary.web_visits.retention_months, 25);
  assert.equal(body.summary.web_visits.visits_deleted, 1);
  assert.equal(await prisma.webVisit.count(), 1);
  assert.deepEqual(body.summary.media_uploads, { pending_deleted: 0, verifying_reset: 0, failed: 0 });
});

test('purge route reaps abandoned uploads (memory storage)', async () => {
  const { MemoryStorage } = await import('@/lib/server/storage/memory');
  const { setStorage, resetStorage } = await import('@/lib/server/storage');
  const store = new MemoryStorage();
  setStorage(store);
  try {
    const stale = await createMediaAsset(prisma, { status: 'pending' });
    store.putObject(stale.objectKey, new Uint8Array(4), 'image/png');
    const crashed = await createMediaAsset(prisma, { status: 'verifying' });
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await prisma.$executeRaw`UPDATE media_assets SET updated_at = ${old} WHERE id IN (${stale.id}::uuid, ${crashed.id}::uuid)`;
    const res = await call(SECRET);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.summary.media_uploads, { pending_deleted: 1, verifying_reset: 1, failed: 0 });
    assert.equal(await prisma.mediaAsset.count({ where: { id: stale.id } }), 0);
    assert.equal(await store.head(stale.objectKey), null);
    assert.equal((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: crashed.id } })).status, 'pending');
  } finally {
    resetStorage();
  }
});
