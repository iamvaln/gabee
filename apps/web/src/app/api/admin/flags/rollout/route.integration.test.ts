// NOTE: rollout/ is one level deeper than flags/, so these test-helper imports use
// FIVE `../` segments (the flags tests use four). @/ aliases are unaffected.
import '../../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../../../test/factories';
import { parentToken, webRequest, adminCookie } from '../../../../../test/auth';
import { setFlagOverride } from '@/lib/server/services/feature-flags';
import { POST } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const url = 'http://localhost/api/admin/flags/rollout';
async function superAdmin() {
  const { parent } = await createLoginableParent(prisma, { role: 'super_admin' });
  return { token: await parentToken(parent.id, parent.email), parent };
}

test('plain admin is forbidden', async () => {
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  const token = await parentToken(parent.id, parent.email);
  const res = await POST(webRequest(url, { method: 'POST', cookie: adminCookie(token),
    body: { flags: ['code_l6'], emails: ['x@y.co'] } }), undefined);
  assert.equal(res.status, 403);
});

test('enable-only leaves notified_at null; send stamps it + writes audit', async () => {
  const { token, parent: actor } = await superAdmin();
  const { parent: target } = await createLoginableParent(prisma);

  // enable only (send:false)
  let res = await POST(webRequest(url, { method: 'POST', cookie: adminCookie(token),
    body: { flags: ['code_l6'], emails: [target.email], send: false } }), undefined);
  assert.equal(res.status, 200);
  let ov = await prisma.featureFlagOverride.findFirst({ where: { flagKey: 'code_l6', parentId: target.id } });
  assert.equal(ov?.enabled, true);
  assert.equal(ov?.notifiedAt, null);

  // notify (send:true) — noop email provider returns ok
  res = await POST(webRequest(url, { method: 'POST', cookie: adminCookie(token),
    body: { flags: ['code_l6'], emails: [target.email], enable: false, send: true } }), undefined);
  const body = await res.json();
  assert.equal(body.summary.sent, 1);
  assert.equal(body.results[0].email_sent, true);
  ov = await prisma.featureFlagOverride.findFirst({ where: { flagKey: 'code_l6', parentId: target.id } });
  assert.ok(ov?.notifiedAt);
  const audit = await prisma.auditLog.findFirst({ where: { actorId: actor.id, kind: 'flag.rollout_notify' } });
  assert.ok(audit);
});

test('notify with no existing override → no_override_to_notify', async () => {
  const { token } = await superAdmin();
  const { parent: target } = await createLoginableParent(prisma);
  const res = await POST(webRequest(url, { method: 'POST', cookie: adminCookie(token),
    body: { flags: ['code_l6'], emails: [target.email], enable: false, send: true } }), undefined);
  const body = await res.json();
  assert.equal(body.results[0].error, 'no_override_to_notify');
  assert.equal(body.summary.failed, 1);
});

test('send failure is reported and does not stamp notified_at', async () => {
  const prev = process.env.EMAIL_PROVIDER;
  process.env.EMAIL_PROVIDER = 'resend'; // no RESEND_API_KEY → deterministic {ok:false}, no network
  try {
    const { token } = await superAdmin();
    const { parent: target } = await createLoginableParent(prisma);
    await setFlagOverride('code_l6', { email: target.email, enabled: true });
    const res = await POST(webRequest(url, { method: 'POST', cookie: adminCookie(token),
      body: { flags: ['code_l6'], emails: [target.email], enable: false, send: true } }), undefined);
    const body = await res.json();
    assert.equal(body.results[0].email_sent, false);
    assert.equal(body.summary.failed, 1);
    const ov = await prisma.featureFlagOverride.findFirst({ where: { flagKey: 'code_l6', parentId: target.id } });
    assert.equal(ov?.notifiedAt, null);
  } finally {
    if (prev === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = prev;
  }
});
