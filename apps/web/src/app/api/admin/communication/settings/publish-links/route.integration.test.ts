import '../../../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import { createLoginableParent } from '@/test/factories';
import { adminCookie, parentToken, webRequest } from '@/test/auth';
import { GET as getSettings } from '../route';
import { GET as getToday } from '../../today/route';
import { PATCH as patchLinks } from './route';

const prisma = createTestClient();
const U = 'http://localhost/api/admin/communication';
const LINKEDIN = 'https://www.linkedin.com/company/109660238/admin/page-posts/published/?share=true';
const TIKTOK = 'https://www.tiktok.com/tiktokstudio/upload';
let adminC: { name: string; value: string };
let superC: { name: string; value: string };
let superId: string;

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  const { parent: a } = await createLoginableParent(prisma, { role: 'admin' });
  adminC = adminCookie(await parentToken(a.id, a.email));
  const { parent: s } = await createLoginableParent(prisma, { role: 'super_admin' });
  superId = s.id;
  superC = adminCookie(await parentToken(s.id, s.email));
});
after(() => prisma.$disconnect());

const req = (method: string, path: string, cookie: { name: string; value: string } | undefined, body?: unknown) =>
  webRequest(`${U}${path}`, { method, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { body } : {}) });
const patch = (body: unknown, cookie = superC) => patchLinks(req('PATCH', '/settings/publish-links', cookie, body), undefined);

test('Réglages and Aujourd’hui read the seeded publish links; only a super-admin may edit them', async () => {
  const view = await (await getSettings(req('GET', '/settings', adminC), undefined)).json();
  assert.deepEqual(view.publish_links, { linkedin: LINKEDIN, tiktok: TIKTOK });
  assert.equal(view.can_edit, false);

  const today = await (await getToday(req('GET', '/today', adminC), undefined)).json();
  assert.deepEqual(today.publish_links, { linkedin: LINKEDIN, tiktok: TIKTOK });
  assert.equal(today.can_edit_settings, false);
  assert.equal((await (await getToday(req('GET', '/today', superC), undefined)).json()).can_edit_settings, true);

  assert.equal((await patch({ linkedin: 'https://www.linkedin.com/company/1/' }, adminC)).status, 403);
  assert.equal((await patchLinks(req('PATCH', '/settings/publish-links', undefined, { linkedin: 'https://www.linkedin.com/company/1/' }), undefined)).status, 401);
  assert.equal((await prisma.platformProfile.findUniqueOrThrow({ where: { platform: 'linkedin' } })).publishUrl, LINKEDIN);
});

test('PATCH saves an https link on the platform’s host, clears one with null, and audits each change', async () => {
  const res = await patch({ linkedin: '  https://www.linkedin.com/company/42/admin/  ' });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).publish_links, { linkedin: 'https://www.linkedin.com/company/42/admin/', tiktok: TIKTOK });

  const cleared = await patch({ tiktok: null, linkedin: '' });
  assert.deepEqual((await cleared.json()).publish_links, { linkedin: null, tiktok: null });

  const rows = await prisma.auditLog.findMany({ where: { kind: 'content.publish_link.update' }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(
    rows.map((r) => [r.targetId, r.diff]),
    [
      ['linkedin', { before: LINKEDIN, after: 'https://www.linkedin.com/company/42/admin/' }],
      ['linkedin', { before: 'https://www.linkedin.com/company/42/admin/', after: null }],
      ['tiktok', { before: TIKTOK, after: null }],
    ],
  );
  for (const r of rows) assert.equal(r.actorId, superId);

  // Saving the same link again changes nothing and writes no audit row.
  await patch({ tiktok: null });
  assert.equal(await prisma.auditLog.count({ where: { kind: 'content.publish_link.update' } }), 3);
});

test('PATCH refuses a link that is not https on the platform’s own host (422 in French), and keeps the saved one', async () => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ linkedin: 'www.linkedin.com/company/1' }, /adresse complète/],
    [{ linkedin: 'http://www.linkedin.com/company/1' }, /https:\/\//],
    [{ linkedin: 'https://www.tiktok.com/upload' }, /linkedin\.com/],
    [{ tiktok: 'https://evil.example/?u=https://www.tiktok.com' }, /tiktok\.com/],
    [{ linkedin: `https://www.linkedin.com/${'a'.repeat(600)}` }, /trop long/],
  ];
  for (const [body, message] of cases) {
    const res = await patch(body);
    assert.equal(res.status, 422, JSON.stringify(body));
    const { error } = await res.json();
    assert.equal(error.code, 'invalid_publish_url');
    assert.match(error.message, message);
  }
  // One bad link refuses the whole change.
  assert.equal((await patch({ linkedin: 'https://www.linkedin.com/company/5/', tiktok: 'ftp://tiktok.com' })).status, 422);
  assert.deepEqual(
    (await prisma.platformProfile.findMany({ orderBy: { platform: 'asc' }, select: { platform: true, publishUrl: true } })).map((p) => p.publishUrl),
    [LINKEDIN, TIKTOK],
  );
  assert.equal((await patch({})).status, 422);
  assert.equal((await patch({ instagram: 'https://instagram.com' })).status, 422);
  assert.equal(await prisma.auditLog.count(), 0);
});
