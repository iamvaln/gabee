import '../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createContentDraft, createContentSlot, createContentWeek, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import { setErrorReporterForTests } from '../report-error';
import type { EmailMessage, EmailSendResult } from '../email';
import { notifyOnce, pendingCounts, studioLink } from './notify';

const prisma = createTestClient();
let reported: unknown[] = [];
let sent: EmailMessage[] = [];

const ok = async (m: EmailMessage): Promise<EmailSendResult> => {
  sent.push(m);
  return { ok: true, providerId: `id-${sent.length}` };
};
const build = () => ({ subject: 'S', text: 'T', html: '<p>T</p>' });

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  await prisma.studioSettings.update({ where: { id: 'default' }, data: { recipients: ['a@x.test', 'b@x.test'] } });
  reported = [];
  sent = [];
  setErrorReporterForTests((err) => reported.push(err));
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  setErrorReporterForTests(null);
  mock.restoreAll();
});
after(async () => prisma.$disconnect());

test('notifyOnce sends once per recipient per period', async () => {
  assert.deepEqual(await notifyOnce('day.drafts', '2026-10-30', build, ok), { sent: 2, skipped: 0, failed: 0 });
  assert.deepEqual(await notifyOnce('day.drafts', '2026-10-30', build, ok), { sent: 0, skipped: 2, failed: 0 });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((m) => m.to).sort(), ['a@x.test', 'b@x.test']);
  assert.equal(await prisma.studioNotification.count({ where: { status: 'sent' } }), 2);
  // another period is a new email
  assert.equal((await notifyOnce('day.drafts', '2026-10-31', build, ok)).sent, 2);
});

test('concurrent ticks never double-send', async () => {
  await Promise.all([notifyOnce('week.remind', 'w1', build, ok), notifyOnce('week.remind', 'w1', build, ok)]);
  assert.equal(sent.length, 2);
});

test('failed send is recorded and retried next time', async () => {
  const bad = async (m: EmailMessage): Promise<EmailSendResult> =>
    m.to === 'a@x.test' ? { ok: false, error: 'boom' } : ok(m);
  assert.deepEqual(await notifyOnce('week.proposals', 'w2', build, bad), { sent: 1, skipped: 0, failed: 1 });
  const row = await prisma.studioNotification.findFirstOrThrow({ where: { recipient: 'a@x.test' } });
  assert.equal(row.status, 'failed');
  assert.equal(row.error, 'boom');
  assert.equal(reported.length, 1);

  assert.deepEqual(await notifyOnce('week.proposals', 'w2', build, ok), { sent: 1, skipped: 1, failed: 0 });
  assert.equal((await prisma.studioNotification.findFirstOrThrow({ where: { recipient: 'a@x.test' } })).status, 'sent');
});

test('a throwing sender counts as failed, not a crash', async () => {
  const boom = async (): Promise<EmailSendResult> => {
    throw new Error('network');
  };
  assert.equal((await notifyOnce('job.failed', 'k', build, boom)).failed, 2);
});

test('falls back to ADMIN_DIGEST_TO when settings have no recipients', async () => {
  await prisma.studioSettings.update({ where: { id: 'default' }, data: { recipients: [] } });
  const r = await notifyOnce('budget.alert', '2026-10', build, ok);
  assert.equal(r.sent, 1);
  assert.equal(sent[0]!.to, 'nguemnev@gmail.com');
});

test('studioLink points at the admin communication pages', () => {
  assert.match(studioLink('/semaine'), /\/admin\/communication\/semaine$/);
});

test('pendingCounts feeds the nav badge', async () => {
  const w1 = await createContentWeek(prisma, { startsOn: new Date('2026-10-26'), firstDay: new Date('2026-10-26'), status: 'proposals_ready' });
  await createContentWeek(prisma, { startsOn: new Date('2026-11-02'), firstDay: new Date('2026-11-02'), status: 'titles_ready' });
  const slot = (date: string, status = 'drafted') => createContentSlot(prisma, w1.id, { date: new Date(date), status });
  const s1 = await slot('2026-10-27');
  const s2 = await slot('2026-10-28');
  const sSkipped = await slot('2026-10-29', 'skipped');
  const sFuture = await slot('2026-10-31');
  const d = (slotId: string, platform: string, status: string) => createContentDraft(prisma, slotId, { platform, language: 'fr', status, trackedUrl: 'https://gabee.app' });
  await d(s1.id, 'linkedin', 'ready');
  await d(s1.id, 'tiktok', 'approved');
  await d(s2.id, 'linkedin', 'failed');
  await d(s2.id, 'tiktok', 'stale');
  await d(sSkipped.id, 'linkedin', 'ready');
  await d(sFuture.id, 'linkedin', 'ready');
  assert.deepEqual(await pendingCounts('2026-10-28'), { proposals: 1, titles: 1, approve: 3, publish: 1 });
});

test('pendingCounts ignores drafts before yesterday and weeks before the current one', async () => {
  // An abandoned week from two weeks ago, never moved on.
  const old = await createContentWeek(prisma, { startsOn: new Date('2026-10-12'), firstDay: new Date('2026-10-12'), status: 'proposals_ready' });
  await createContentWeek(prisma, { startsOn: new Date('2026-10-19'), firstDay: new Date('2026-10-19'), status: 'titles_ready' });
  const cur = await createContentWeek(prisma, { startsOn: new Date('2026-10-26'), firstDay: new Date('2026-10-26'), status: 'validated' });
  const d = (slotId: string, platform: string, status: string) => createContentDraft(prisma, slotId, { platform, language: 'fr', status, trackedUrl: 'https://gabee.app' });
  const oldSlot = await createContentSlot(prisma, old.id, { date: new Date('2026-10-14'), status: 'drafted' });
  await d(oldSlot.id, 'linkedin', 'ready');
  await d(oldSlot.id, 'tiktok', 'approved');
  // Two days ago in the current week: no longer on Aujourd'hui.
  const monday = await createContentSlot(prisma, cur.id, { date: new Date('2026-10-26'), status: 'drafted' });
  await d(monday.id, 'linkedin', 'failed');
  await d(monday.id, 'tiktok', 'approved');
  const tuesday = await createContentSlot(prisma, cur.id, { date: new Date('2026-10-27'), status: 'drafted' });
  await d(tuesday.id, 'linkedin', 'ready');

  assert.deepEqual(await pendingCounts('2026-10-28'), { proposals: 0, titles: 0, approve: 1, publish: 0 });
  // Sunday: the week being planned (next Monday) counts; the current one is still >= its Monday.
  await createContentWeek(prisma, { startsOn: new Date('2026-11-02'), firstDay: new Date('2026-11-02'), status: 'proposals_ready' });
  assert.deepEqual(await pendingCounts('2026-11-01'), { proposals: 1, titles: 0, approve: 0, publish: 0 });
});
