import '../../../../test/setup-integration'; // src/app/api/auth/login -> src/test (4 dirs up)
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { PARENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE } from '@/lib/server/env';
import { createLoginableParent } from '../../../../test/factories';
import { webRequest } from '../../../../test/auth';
import { POST } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const url = 'http://localhost/api/auth/login';

test('correct credentials → 200, parent session cookie set, token returned', async () => {
  const { parent, password } = await createLoginableParent(prisma);
  const res = await POST(webRequest(url, { body: { email: parent.email, password } }), undefined);
  assert.equal(res.status, 200);
  assert.ok(res.cookies.get(PARENT_SESSION_COOKIE)?.value); // httpOnly session cookie issued
  assert.equal(res.cookies.get(ADMIN_SESSION_COOKIE)?.value, undefined); // NOT the admin cookie
  const body = await res.json();
  assert.ok(body.token);
});

test('wrong password → 401, no cookie', async () => {
  const { parent } = await createLoginableParent(prisma);
  const res = await POST(
    webRequest(url, { body: { email: parent.email, password: 'wrong' } }),
    undefined,
  );
  assert.equal(res.status, 401);
  assert.equal(res.cookies.get(PARENT_SESSION_COOKIE)?.value, undefined);
});

test('unconfirmed account with correct password → 403 email_not_confirmed', async () => {
  const { parent, password } = await createLoginableParent(prisma, { confirmed: false });
  const res = await POST(webRequest(url, { body: { email: parent.email, password } }), undefined);
  assert.equal(res.status, 403);
});

test('an admin logs in on the admin cookie surface', async () => {
  const { parent, password } = await createLoginableParent(prisma, { role: 'admin' });
  const res = await POST(webRequest(url, { body: { email: parent.email, password } }), undefined);
  assert.equal(res.status, 200);
  assert.ok(res.cookies.get(ADMIN_SESSION_COOKIE)?.value); // admins get gabee_admin_session
  assert.equal(res.cookies.get(PARENT_SESSION_COOKIE)?.value, undefined); // NOT the parent cookie
});

test('rate limit: repeated failures from ONE ip eventually 429', async () => {
  const { parent } = await createLoginableParent(prisma);
  const ip = '203.0.113.7'; // fixed IP → same bucket
  let sawLimit = false;
  for (let i = 0; i < 8; i++) {
    const res = await POST(
      webRequest(url, { ip, body: { email: parent.email, password: 'wrong' } }),
      undefined,
    );
    if (res.status === 429) {
      sawLimit = true;
      break;
    }
  }
  assert.ok(sawLimit, 'expected a 429 within 8 attempts from one IP (limit is 5/5min)');
});
