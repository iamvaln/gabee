import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { webRequest } from '../../../test/auth';
import { POST } from './route';

// Own hosts derive from the parent-app URL at call time.
process.env.NEXT_PUBLIC_PARENT_APP_URL = 'https://parents.gabee.app';
const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const URL = 'https://gabee.app/api/visits';
const body = { path: '/fr', utm: { source: 'tiktok', content: 'bio' } };
const call = (headers: Record<string, string>, ip?: string, b: unknown = body) =>
  POST(webRequest(URL, { body: b, headers: { 'user-agent': CHROME, ...headers }, ...(ip ? { ip } : {}) }), {
    params: Promise.resolve({}),
  } as never);

test('POST /api/visits from a Gabee origin is stored and answers 204', async () => {
  const res = await call({ origin: 'https://gabee.app' });
  assert.equal(res.status, 204);
  assert.equal(await prisma.webVisit.count(), 1);
});

test('POST /api/visits without Origin (sendBeacon same-origin) is accepted', async () => {
  const res = await call({});
  assert.equal(res.status, 204);
});

test('POST /api/visits from foreign origin is 403', async () => {
  const res = await call({ origin: 'https://evil.example.com' });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'forbidden_origin');
  assert.equal(await prisma.webVisit.count(), 0);
});

test('POST /api/visits from a bot is 204 and not stored', async () => {
  const res = await call({ origin: 'https://gabee.app', 'user-agent': 'Googlebot/2.1' });
  assert.equal(res.status, 204);
  assert.equal(await prisma.webVisit.count(), 0);
});

test('POST /api/visits rejects an invalid body', async () => {
  const res = await call({ origin: 'https://gabee.app' }, undefined, { nope: true });
  assert.equal(res.status, 422);
});

test('POST /api/visits is rate limited after 120/min', async () => {
  const ip = '203.0.113.77';
  for (let i = 0; i < 120; i++) {
    assert.equal((await call({ origin: 'https://gabee.app' }, ip)).status, 204);
  }
  assert.equal((await call({ origin: 'https://gabee.app' }, ip)).status, 429);
});
