import '../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';

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
});
