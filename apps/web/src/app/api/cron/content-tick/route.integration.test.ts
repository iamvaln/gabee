import '../../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';

// env.ts reads CRON_SECRET at import time: set it before loading anything that
// imports it (static imports would be evaluated first).
const SECRET = 'test-cron-secret-0123456789abcdef0123456789';
process.env.CRON_SECRET = SECRET;
const { POST } = await import('./route');
const { webRequest } = await import('../../../../test/auth');
const { setErrorReporterForTests } = await import('@/lib/server/report-error');
const { FakeAiAdapter, resetAiAdapters, setAiAdapters } = await import('@/lib/server/ai/router');

const prisma = createTestClient();
beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  // Whatever the wall clock, no job may reach a real model or the mailer.
  setAiAdapters([new FakeAiAdapter([])]);
  setErrorReporterForTests(() => {});
  mock.method(console, 'error', () => {});
  mock.method(console, 'info', () => {});
});
afterEach(() => {
  resetAiAdapters();
  setErrorReporterForTests(null);
  mock.restoreAll();
});
after(async () => prisma.$disconnect());

const URL = 'http://web:3000/api/cron/content-tick';
const call = (bearer?: string) => POST(webRequest(URL, bearer ? { bearer } : {}), { params: Promise.resolve({}) } as never);

test('content-tick route rejects a wrong secret', async () => {
  const res = await call('not-the-secret');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'unauthorized');
  assert.equal(await prisma.jobRun.count(), 0, 'no job ran');
});

test('content-tick route rejects a missing secret', async () => {
  const res = await call();
  assert.equal(res.status, 401);
  assert.equal(await prisma.jobRun.count(), 0);
});

test('content-tick route runs the tick with the right secret', async () => {
  const res = await call(SECRET);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.summary.ran));
  assert.equal(typeof body.summary.skipped, 'number');
  // budget.check is due at every hour of every day.
  assert.ok(body.summary.ran.some((r: { jobKey: string }) => r.jobKey === 'budget.check'));
  assert.ok((await prisma.jobRun.count()) >= 1);
});
