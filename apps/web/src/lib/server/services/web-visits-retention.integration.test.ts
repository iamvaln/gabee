import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { purgeExpiredWebVisits, webVisitsCutoff, WEB_VISITS_RETENTION_MONTHS } from './web-visits-retention';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const visit = (day: string) =>
  prisma.webVisit.create({
    data: { day: new Date(`${day}T00:00:00Z`), path: '/fr', deviceClass: 'desktop', source: 'direct' },
  });

test('retention is 25 months', () => {
  assert.equal(WEB_VISITS_RETENTION_MONTHS, 25);
});

test('cutoff is UTC midnight 25 calendar months back (end-of-month clamped)', () => {
  assert.equal(webVisitsCutoff(new Date('2026-10-23T15:42:00Z')).toISOString(), '2024-09-23T00:00:00.000Z');
  // 31 Mar − 25 months → Feb 2024 has 29 days: clamp, never roll into March.
  assert.equal(webVisitsCutoff(new Date('2026-03-31T08:00:00Z')).toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(webVisitsCutoff(new Date('2026-01-05T00:00:00Z')).toISOString(), '2023-12-05T00:00:00.000Z');
});

test('purgeExpiredWebVisits deletes visits older than 25 months and keeps newer ones', async () => {
  const now = new Date('2026-10-23T03:00:00Z');
  await visit('2024-09-22'); // 25 months + 1 day → deleted
  await visit('2023-01-01'); // far older → deleted
  await visit('2024-09-23'); // exactly 25 months → kept (cutoff day itself)
  await visit('2024-10-23'); // 24 months → kept
  await visit('2026-10-22'); // yesterday → kept

  const summary = await purgeExpiredWebVisits(now);
  assert.deepEqual(summary, { cutoff: '2024-09-23T00:00:00.000Z', retention_months: 25, visits_deleted: 2 });
  const left = (await prisma.webVisit.findMany({ orderBy: { day: 'asc' } })).map((v) =>
    v.day.toISOString().slice(0, 10),
  );
  assert.deepEqual(left, ['2024-09-23', '2024-10-23', '2026-10-22']);

  // Idempotent: a second run the same day deletes nothing.
  assert.equal((await purgeExpiredWebVisits(now)).visits_deleted, 0);
});
