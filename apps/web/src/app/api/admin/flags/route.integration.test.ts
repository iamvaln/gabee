import '../../../../test/setup-integration'; // flags -> admin -> api -> app -> src, then test
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../../test/factories';
import { parentToken, webRequest, adminCookie } from '../../../../test/auth';
import { GET } from './route';
import { PATCH } from './[key]/route';
import { GET as OV_GET, PUT as OV_PUT, DELETE as OV_DELETE } from './[key]/overrides/route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const listUrl = 'http://localhost/api/admin/flags';
const keyCtx = (key: string) => ({ params: Promise.resolve({ key }) });

async function admin(role: 'admin' | 'super_admin') {
  const { parent } = await createLoginableParent(prisma, { role });
  const token = await parentToken(parent.id, parent.email);
  return { token, parent };
}

test('no session → 401; plain parent → 403', async () => {
  assert.equal((await GET(webRequest(listUrl, { method: 'GET' }), undefined)).status, 401);
  const { parent } = await createLoginableParent(prisma); // role: parent
  const token = await parentToken(parent.id, parent.email);
  const res = await GET(webRequest(listUrl, { method: 'GET', cookie: adminCookie(token) }), undefined);
  assert.equal(res.status, 403);
});

test('admin can list; only super_admin can PATCH a default', async () => {
  const { token: adminTok } = await admin('admin');
  const listed = await GET(webRequest(listUrl, { method: 'GET', cookie: adminCookie(adminTok) }), undefined);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).flags.length, 3);

  // a plain admin cannot write
  const forbid = await PATCH(
    webRequest('http://localhost/api/admin/flags/kid_voiceover', { method: 'PATCH', cookie: adminCookie(adminTok), body: { enabled_default: false } }),
    keyCtx('kid_voiceover'),
  );
  assert.equal(forbid.status, 403);

  // super_admin can, and it writes an audit row
  const { token: superTok, parent: superParent } = await admin('super_admin');
  const ok = await PATCH(
    webRequest('http://localhost/api/admin/flags/kid_voiceover', { method: 'PATCH', cookie: adminCookie(superTok), body: { enabled_default: false } }),
    keyCtx('kid_voiceover'),
  );
  assert.equal(ok.status, 200);
  const flag = await prisma.featureFlag.findUnique({ where: { key: 'kid_voiceover' } });
  assert.equal(flag?.enabledDefault, false);
  const audit = await prisma.auditLog.findFirst({ where: { actorId: superParent.id, kind: 'flag.update' } });
  assert.ok(audit);
});

test('super_admin sets, lists, and removes an override by email', async () => {
  const { token: superTok } = await admin('super_admin');
  const { parent: target } = await createLoginableParent(prisma);
  const ovUrl = `http://localhost/api/admin/flags/kid_ambient_music/overrides`;

  const put = await OV_PUT(
    webRequest(ovUrl, { method: 'PUT', cookie: adminCookie(superTok), body: { email: target.email, enabled: true } }),
    keyCtx('kid_ambient_music'),
  );
  assert.equal(put.status, 200);

  const list = await OV_GET(webRequest(ovUrl, { method: 'GET', cookie: adminCookie(superTok) }), keyCtx('kid_ambient_music'));
  assert.equal((await list.json()).overrides[0].email, target.email);

  const del = await OV_DELETE(
    webRequest(ovUrl, { method: 'DELETE', cookie: adminCookie(superTok), body: { email: target.email } }),
    keyCtx('kid_ambient_music'),
  );
  assert.equal(del.status, 200);
  const after = await OV_GET(webRequest(ovUrl, { method: 'GET', cookie: adminCookie(superTok) }), keyCtx('kid_ambient_music'));
  assert.equal((await after.json()).overrides.length, 0);
});
