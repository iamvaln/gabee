import '../../../../test/setup-integration'; // src/app/api/admin/content -> src/test (4 dirs up)
import { randomUUID } from 'node:crypto';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createCurriculum } from '@gabee/db/testing';
import { createLoginableParent } from '../../../../test/factories';
import { parentToken, webRequest, adminCookie } from '../../../../test/auth';
import { GET as MATRIX_GET } from './matrix/route';
import { POST as PUBLISH_POST } from './publish/route';

const prisma = createTestClient();
beforeEach(async () => {
  await resetDb(prisma);
  // publish's handler resolves getDefaultCurriculumId() after the guard passes.
  await createCurriculum(prisma, { id: randomUUID(), isDefault: true });
});
after(async () => prisma.$disconnect());

const MATRIX_URL = 'http://localhost/api/admin/content/matrix';
const PUBLISH_URL = 'http://localhost/api/admin/content/publish';

function matrixReq(cookieToken?: string) {
  return MATRIX_GET(
    webRequest(MATRIX_URL, { method: 'GET', ...(cookieToken ? { cookie: adminCookie(cookieToken) } : {}) }),
    undefined,
  );
}
function publishReq(cookieToken?: string) {
  return PUBLISH_POST(
    webRequest(PUBLISH_URL, {
      method: 'POST',
      body: { module: 'numbers' },
      ...(cookieToken ? { cookie: adminCookie(cookieToken) } : {}),
    }),
    undefined,
  );
}

async function tokenFor(role?: 'admin' | 'super_admin') {
  const { parent } = await createLoginableParent(prisma, role ? { role } : {});
  return parentToken(parent.id, parent.email);
}

// ── requireAdmin route: GET /api/admin/content/matrix ───────────────────────

test('matrix (requireAdmin): no session → 401', async () => {
  assert.equal((await matrixReq()).status, 401);
});

test('matrix (requireAdmin): a plain parent → 403 forbidden', async () => {
  const res = await matrixReq(await tokenFor());
  assert.equal(res.status, 403);
});

test('matrix (requireAdmin): an admin → allowed (200)', async () => {
  const res = await matrixReq(await tokenFor('admin'));
  assert.equal(res.status, 200);
});

test('matrix (requireAdmin): a super_admin → allowed (200)', async () => {
  const res = await matrixReq(await tokenFor('super_admin'));
  assert.equal(res.status, 200);
});

// ── requireSuperAdmin route: POST /api/admin/content/publish ─────────────────

test('publish (requireSuperAdmin): no session → 401', async () => {
  assert.equal((await publishReq()).status, 401);
});

test('publish (requireSuperAdmin): a plain parent → 403 forbidden', async () => {
  const res = await publishReq(await tokenFor());
  assert.equal(res.status, 403);
});

test('publish (requireSuperAdmin): a mere admin → 403 forbidden (publish is super-admin only)', async () => {
  const res = await publishReq(await tokenFor('admin'));
  assert.equal(res.status, 403);
});

test('publish (requireSuperAdmin): a super_admin → allowed (200)', async () => {
  const res = await publishReq(await tokenFor('super_admin'));
  assert.equal(res.status, 200);
});
