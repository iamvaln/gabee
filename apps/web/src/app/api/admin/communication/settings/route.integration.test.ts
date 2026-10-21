import '../../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContentDraft, createContentSlot, createContentWeek, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import { createLoginableParent } from '@/test/factories';
import { adminCookie, parentToken, webRequest } from '@/test/auth';
import { localParts } from '@/lib/server/content-studio/clock';
import { addDaysYmd } from '@/lib/server/content-studio/state';
import { GET as getSettings, PATCH as patchSettings } from './route';
import { PUT as putObjective } from '../objective/route';
import { POST as publishLine } from '../editorial-line/route';
import { GET as audience } from '../audience/route';

const prisma = createTestClient();
const U = 'http://localhost/api/admin/communication';
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

const month = () => localParts(new Date(), 'Africa/Douala').date.slice(0, 7);

test('settings PATCH requires super_admin', async () => {
  const read = await getSettings(req('GET', '/settings', adminC), undefined);
  assert.equal(read.status, 200);
  const view = await read.json();
  assert.equal(view.can_edit, false);
  assert.equal(view.settings.timezone, 'Africa/Douala');
  assert.equal(view.editorial_line.version, 1);

  assert.equal((await getSettings(req('GET', '/settings', undefined), undefined)).status, 401);
  const forbidden = await patchSettings(req('PATCH', '/settings', adminC, { timezone: 'Europe/Paris' }), undefined);
  assert.equal(forbidden.status, 403);

  const ok = await patchSettings(req('PATCH', '/settings', superC, { timezone: 'Europe/Paris', recipients: ['owner@gabee.app'], monthly_budget_usd: 80 }), undefined);
  assert.equal(ok.status, 200);
  const { settings } = await ok.json();
  assert.equal(settings.timezone, 'Europe/Paris');
  assert.deepEqual(settings.recipients, ['owner@gabee.app']);
  assert.equal(settings.monthly_budget_usd, 80);
  assert.equal((await (await getSettings(req('GET', '/settings', superC), undefined)).json()).can_edit, true);

  const badTz = await patchSettings(req('PATCH', '/settings', superC, { timezone: 'Mars/Olympus' }), undefined);
  assert.equal(badTz.status, 422);
  const row = await prisma.studioSettings.findUniqueOrThrow({ where: { id: 'default' } });
  assert.equal(row.timezone, 'Europe/Paris');
});

test('objective PUT (super_admin) creates then replaces the month objective', async () => {
  const body = { month: month(), type: 'signups', statement: 'Faire connaître Gabee aux parents', targets: { signups: 50 } };
  assert.equal((await putObjective(req('PUT', '/objective', adminC, body), undefined)).status, 403);

  const first = await putObjective(req('PUT', '/objective', superC, body), undefined);
  assert.equal(first.status, 200);
  const { objective } = await first.json();
  assert.equal(objective.month, month());
  assert.deepEqual(objective.targets, { signups: 50 });

  const second = await putObjective(req('PUT', '/objective', superC, { ...body, type: 'awareness', statement: 'Notoriété' }), undefined);
  assert.equal((await second.json()).objective.id, objective.id);
  assert.equal(await prisma.contentObjective.count(), 1);

  const view = await (await getSettings(req('GET', '/settings', adminC), undefined)).json();
  assert.equal(view.objectives.length, 1);
  assert.equal(view.objectives[0].type, 'awareness');
  assert.equal((await putObjective(req('PUT', '/objective', superC, { ...body, month: '2026-13' }), undefined)).status, 422);
});

test('editorial-line POST publishes version n+1 and keeps the previous one', async () => {
  const body = { body: '# Gabee\nUne app de maths pour les 4–8 ans.', product_facts: { modules: ['Nombres'] } };
  assert.equal((await publishLine(req('POST', '/editorial-line', adminC, body), undefined)).status, 403);

  const res = await publishLine(req('POST', '/editorial-line', superC, body), undefined);
  assert.equal(res.status, 200);
  const line = (await res.json()).editorial_line;
  assert.equal(line.version, 2);
  assert.ok(line.published_at);
  assert.equal(line.created_by_id, superId);

  const versions = await prisma.editorialLineVersion.findMany({ orderBy: { version: 'asc' } });
  assert.deepEqual(
    versions.map((v) => [v.version, v.publishedAt !== null]),
    [
      [1, true],
      [2, true],
    ],
  );
  const view = await (await getSettings(req('GET', '/settings', adminC), undefined)).json();
  assert.equal(view.editorial_line.version, 2);
});

test('audience GET reports visits by post with the draft it came from', async () => {
  const week = await createContentWeek(prisma, { status: 'validated' });
  const slot = await createContentSlot(prisma, week.id, { topic: 'Compter les courses' });
  const draft = await createContentDraft(prisma, slot.id, { platform: 'linkedin' });
  const today = localParts(new Date(), 'Africa/Douala').date;
  const now = new Date();
  await prisma.webVisit.createMany({
    data: [
      { occurredAt: now, day: new Date(today), path: '/', deviceClass: 'mobile', source: 'linkedin', content: draft.id },
      { occurredAt: now, day: new Date(today), path: '/', deviceClass: 'desktop', source: 'direct' },
    ],
  });

  const res = await audience(req('GET', '/audience', adminC), undefined);
  assert.equal(res.status, 200);
  const report = await res.json();
  assert.equal(report.to, today);
  assert.equal(report.from, addDaysYmd(today, -6));
  assert.deepEqual(report.by_post, [
    { content: draft.id, visits: 1, signups: 0, draft: { id: draft.id, date: slot.date.toISOString().slice(0, 10), platform: 'linkedin', topic: 'Compter les courses' } },
  ]);
  assert.equal(report.by_source.length, 2);

  assert.equal((await audience(req('GET', '/audience?from=2026-10-30&to=2026-10-01', adminC), undefined)).status, 422);
  assert.equal((await audience(req('GET', '/audience?from=hier', adminC), undefined)).status, 422);
});

test('every mutation writes an audit row', async () => {
  await patchSettings(req('PATCH', '/settings', superC, { budget_alert_ratio: 0.5 }), undefined);
  await putObjective(req('PUT', '/objective', superC, { month: month(), type: 'signups', statement: 'Inscriptions' }), undefined);
  await publishLine(req('POST', '/editorial-line', superC, { body: 'Ligne v2', product_facts: {} }), undefined);

  const rows = await prisma.auditLog.findMany();
  assert.deepEqual(rows.map((r) => r.kind).sort(), ['content.editorial_line.publish', 'content.objective.upsert', 'content.settings.update']);
  for (const r of rows) {
    assert.equal(r.actorId, superId);
    assert.equal(r.actorRole, 'super_admin');
  }
  const settingsDiff = rows.find((r) => r.kind === 'content.settings.update')!.diff as { before: { budget_alert_ratio: number }; after: { budget_alert_ratio: number } };
  assert.equal(settingsDiff.before.budget_alert_ratio, 0.8);
  assert.equal(settingsDiff.after.budget_alert_ratio, 0.5);
});
