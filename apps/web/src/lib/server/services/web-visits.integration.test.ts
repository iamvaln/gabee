import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { recordVisit, getAudience } from './web-visits';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

test('recordVisit stores no IP and computes day in studio timezone', async () => {
  const now = new Date('2026-10-20T23:30:00Z');
  const res = await recordVisit(
    { path: '/fr', utm: { source: 'linkedin', medium: 'social', content: 'd1' }, lang: 'fr' },
    { userAgent: CHROME, now, timezone: 'Africa/Douala' },
  );
  assert.deepEqual(res, { stored: true });
  const rows = await prisma.webVisit.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.day.toISOString().slice(0, 10), '2026-10-21');
  assert.equal(rows[0]!.source, 'linkedin');
  assert.equal(rows[0]!.deviceClass, 'desktop');
  assert.deepEqual(
    Object.keys(rows[0]!).sort(),
    ['campaign', 'content', 'day', 'deviceClass', 'id', 'lang', 'medium', 'occurredAt', 'path', 'referrerHost', 'source'],
  );
});

test('recordVisit drops bots', async () => {
  const res = await recordVisit(
    { path: '/fr', utm: {} },
    { userAgent: 'curl/8.4.0', now: new Date(), timezone: 'Africa/Douala' },
  );
  assert.deepEqual(res, { stored: false });
  assert.equal(await prisma.webVisit.count(), 0);
});

test('getAudience counts signups by utm_content', async () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const meta = { userAgent: CHROME, now, timezone: 'Africa/Douala' };
  await recordVisit({ path: '/fr', utm: { source: 'linkedin', content: 'd1' } }, meta);
  await recordVisit({ path: '/fr', utm: { source: 'linkedin', content: 'd1' } }, meta);
  await recordVisit({ path: '/fr', utm: {} }, meta);
  await prisma.parentAccount.create({
    data: {
      email: 'a@example.com',
      signupSource: { source: 'linkedin', medium: 'social', content: 'd1' },
    },
  });
  await prisma.parentAccount.create({ data: { email: 'b@example.com', signupSource: { source: 'direct' } } });
  await prisma.parentAccount.create({ data: { email: 'c@example.com' } });

  const a = await getAudience({
    from: new Date('2026-10-19T00:00:00Z'),
    to: new Date(Date.now() + 86_400_000),
  });
  assert.deepEqual(a.byDay, [{ day: '2026-10-20', visits: 3 }]);
  const li = a.bySource.find((s) => s.source === 'linkedin')!;
  assert.deepEqual(li, { source: 'linkedin', visits: 2, signups: 1 });
  assert.deepEqual(a.bySource.find((s) => s.source === 'direct'), { source: 'direct', visits: 1, signups: 1 });
  assert.deepEqual(a.byContent, [{ content: 'd1', visits: 2, signups: 1 }]);
});
