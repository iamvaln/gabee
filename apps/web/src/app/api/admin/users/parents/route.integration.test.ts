import '../../../../../test/setup-integration'; // src/app/api/admin/users/parents -> src/test (5 dirs up)
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../../../test/factories';
import { parentToken, webRequest, adminCookie, parentCookie } from '../../../../../test/auth';
import { GET } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const url = 'http://localhost/api/admin/users/parents';

test('no session → 401', async () => {
  const res = await GET(webRequest(url, { method: 'GET' }), undefined);
  assert.equal(res.status, 401);
});

test('a plain parent (even on the admin cookie) → 403 forbidden', async () => {
  const { parent } = await createLoginableParent(prisma); // role: 'parent'
  const token = await parentToken(parent.id, parent.email);
  const res = await GET(webRequest(url, { method: 'GET', cookie: adminCookie(token) }), undefined);
  assert.equal(res.status, 403); // requireAdmin re-reads role from DB → not admin
});

test('an admin on the admin cookie → 200', async () => {
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  const token = await parentToken(parent.id, parent.email);
  const res = await GET(webRequest(url, { method: 'GET', cookie: adminCookie(token) }), undefined);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.parents));
});

// `requireParent`/`requireAdmin` call `getSession(req)` with NO surface argument
// (see lib/server/http.ts), so `getSession` falls back to checking EVERY cookie
// name (parent, admin, legacy) rather than restricting to the admin surface —
// see `cookieNamesForSurface(undefined)` in lib/server/auth.ts. The cookie-name
// -> surface separation is enforced by the browser's cookie Domain scoping
// (COOKIE_DOMAIN_ADMIN/COOKIE_DOMAIN_PARENT) at issuance time, not by the
// route guard reading a specific cookie name. So an admin whose token merely
// happens to be sent under the PARENT cookie name is still admitted here: the
// guard finds a valid session either way, then re-reads the DB role and finds
// 'admin'. Asserting the REAL observed behavior, not the admin-surface-only
// guess.
test('an admin on the PARENT cookie is still admitted (role, not cookie name, gates requireAdmin)', async () => {
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  const token = await parentToken(parent.id, parent.email);
  const res = await GET(webRequest(url, { method: 'GET', cookie: parentCookie(token) }), undefined);
  assert.equal(res.status, 200);
});
