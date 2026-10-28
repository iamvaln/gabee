import '../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createContentDraft, createContentSlot, createContentWeek, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import type { ContentLanguage, ContentPlatform, PostingDays } from '@gabee/types';
import { setErrorReporterForTests } from '../report-error';
import { HttpError } from '../http';
import type { Actor } from './state';
import { applyRhythm, planRhythm, samePosts } from './rhythm';
import { skipDay, updateSlot } from './weeks';

const prisma = createTestClient();
const actor: Actor = { id: randomUUID(), role: 'super_admin' };

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  setErrorReporterForTests(() => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  setErrorReporterForTests(null);
  mock.restoreAll();
});
after(async () => prisma.$disconnect());

/** Wednesday 28 October 2026, 10:00 in Douala. */
const WEDNESDAY = new Date('2026-10-28T09:00:00Z');
const isHttp = (status: number, code: string) => (err: unknown) => err instanceof HttpError && err.status === status && err.code === code;

type Line = [date: string, posts: Array<[ContentPlatform, ContentLanguage]>];

/**
 * The validated week of Mon 26 Oct on the default cadence (LinkedIn Tue–Thu,
 * TikTok Mon/Wed/Fri/Sun). TikTok's only English post is Friday's, LinkedIn's
 * Tuesday's (past).
 */
const DEFAULT_LINES: Line[] = [
  ['2026-10-26', [['tiktok', 'fr']]],
  ['2026-10-27', [['linkedin', 'en']]],
  ['2026-10-28', [['linkedin', 'fr'], ['tiktok', 'fr']]],
  ['2026-10-29', [['linkedin', 'fr']]],
  ['2026-10-30', [['tiktok', 'en']]],
  ['2026-11-01', [['tiktok', 'fr']]],
];

async function validatedWeek(lines: Line[] = DEFAULT_LINES) {
  const week = await createContentWeek(prisma, { startsOn: new Date('2026-10-26'), firstDay: new Date('2026-10-26'), status: 'validated' });
  const slots: Record<string, string> = {};
  for (const [date, posts] of lines) {
    const slot = await createContentSlot(prisma, week.id, {
      date: new Date(date),
      platforms: posts.map(([platform, language]) => ({ platform, language })),
      status: date < '2026-10-28' ? 'done' : 'validated',
    });
    slots[date] = slot.id;
  }
  return { weekId: week.id, slots };
}

const setCadence = (postingDays: PostingDays) => prisma.studioSettings.update({ where: { id: 'default' }, data: { postingDays } });
const lineOf = async (slotId: string) => {
  const s = await prisma.contentSlot.findUniqueOrThrow({ where: { id: slotId } });
  return { status: s.status, platforms: s.platforms, skipReason: s.skipReason };
};

test('planRhythm previews the change for the future days only and changes nothing', async () => {
  const { weekId } = await validatedWeek();
  // New rhythm: LinkedIn Mon + Fri, TikTok Thu + Sat.
  await setCadence({ linkedin: [1, 5], tiktok: [4, 6] });
  const before = await prisma.contentSlot.findMany({ orderBy: { date: 'asc' } });

  const plan = await planRhythm(weekId, WEDNESDAY);
  assert.equal(plan.today, '2026-10-28');
  assert.deepEqual(
    plan.changes.map((c) => [c.date, c.kind, c.after, c.english_switched]),
    [
      // Thursday: LinkedIn → TikTok, which loses Friday's English post: Thursday's TikTok goes English.
      ['2026-10-29', 'adjust', [{ platform: 'tiktok', language: 'en' }], ['tiktok']],
      // Friday: TikTok → LinkedIn (a new platform starts in French).
      ['2026-10-30', 'adjust', [{ platform: 'linkedin', language: 'fr' }], []],
      // Sunday: nothing posts any more.
      ['2026-11-01', 'skip', [], []],
    ],
  );
  assert.deepEqual(plan.days_without_line, ['2026-10-31'], 'Saturday is a new posting day without a line this week');
  assert.deepEqual(plan.kept_with_drafts, []);
  assert.deepEqual(plan.english_missing, []);
  assert.deepEqual(plan.counts, { adjusted: 2, skipped: 1 });
  assert.deepEqual(await prisma.contentSlot.findMany({ orderBy: { date: 'asc' } }), before, 'a preview writes nothing');
});

test('applyRhythm adjusts and skips the future days through the audited slot actions, never today or the past', async () => {
  const { weekId, slots } = await validatedWeek();
  await setCadence({ linkedin: [1, 5], tiktok: [4, 6] });
  const todayBefore = await lineOf(slots['2026-10-28']!);
  const pastBefore = await lineOf(slots['2026-10-27']!);

  const { plan, week, applied } = await applyRhythm(weekId, actor, WEDNESDAY);
  assert.deepEqual(plan.counts, { adjusted: 2, skipped: 1 });
  assert.deepEqual(applied, { adjusted: 2, skipped: 1 });
  assert.deepEqual(await lineOf(slots['2026-10-29']!), { status: 'validated', platforms: [{ platform: 'tiktok', language: 'en' }], skipReason: null });
  assert.deepEqual(await lineOf(slots['2026-10-30']!), { status: 'validated', platforms: [{ platform: 'linkedin', language: 'fr' }], skipReason: null });
  assert.deepEqual(await lineOf(slots['2026-11-01']!), { status: 'skipped', platforms: [{ platform: 'tiktok', language: 'fr' }], skipReason: 'Nouveau rythme' });
  assert.deepEqual(await lineOf(slots['2026-10-28']!), todayBefore, 'today is never touched');
  assert.deepEqual(await lineOf(slots['2026-10-27']!), pastBefore);
  assert.equal(week.status, 'validated');
  assert.deepEqual(
    week.language_quota.map((q) => [q.platform, q.english, q.ok]),
    [
      ['linkedin', 1, true],
      ['tiktok', 1, true],
    ],
  );

  const kinds = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => a.kind);
  assert.deepEqual(kinds.sort(), ['content.slot.skip', 'content.slot.update', 'content.slot.update', 'content.week.apply_rhythm'].sort());
  const summary = await prisma.auditLog.findFirstOrThrow({ where: { kind: 'content.week.apply_rhythm' } });
  assert.equal(summary.actorId, actor.id);
  assert.equal(summary.targetId, weekId);
  assert.deepEqual((summary.diff as { adjusted: number; skipped: number }).adjusted, 2);
});

test('applyRhythm is idempotent: a second run has nothing to do', async () => {
  const { weekId } = await validatedWeek();
  await setCadence({ linkedin: [1, 5], tiktok: [4, 6] });
  await applyRhythm(weekId, actor, WEDNESDAY);
  const rows = await prisma.contentSlot.findMany({ orderBy: { date: 'asc' } });
  const audits = await prisma.auditLog.count();

  const again = await applyRhythm(weekId, actor, WEDNESDAY);
  assert.deepEqual(again.plan.changes, []);
  assert.deepEqual(again.plan.counts, { adjusted: 0, skipped: 0 });
  assert.deepEqual(await prisma.contentSlot.findMany({ orderBy: { date: 'asc' } }), rows);
  assert.equal(await prisma.auditLog.count(), audits, 'no change, no audit row');
});

test('a future day that already has drafts is left as it is', async () => {
  const { weekId, slots } = await validatedWeek();
  await createContentDraft(prisma, slots['2026-10-29']!, { platform: 'linkedin', status: 'ready' });
  await setCadence({ linkedin: [1, 5], tiktok: [4, 6] });

  const { plan } = await applyRhythm(weekId, actor, WEDNESDAY);
  assert.deepEqual(plan.kept_with_drafts, ['2026-10-29']);
  assert.deepEqual(
    plan.changes.map((c) => c.date),
    ['2026-10-30', '2026-11-01'],
  );
  assert.deepEqual(await lineOf(slots['2026-10-29']!), { status: 'validated', platforms: [{ platform: 'linkedin', language: 'fr' }], skipReason: null });
  // TikTok lost its only English post (Friday) and no future TikTok day can take it: the owner is warned.
  assert.deepEqual(plan.english_missing, ['tiktok']);
});

test('the English post moves to a remaining future post of the platform when the cadence drops its day', async () => {
  // TikTok keeps Wednesday, Friday (English) and Sunday; the new rhythm drops Friday.
  const { weekId, slots } = await validatedWeek();
  await setCadence({ linkedin: [2, 3, 4], tiktok: [0, 1, 3] });
  const { plan } = await applyRhythm(weekId, actor, WEDNESDAY);
  assert.deepEqual(
    plan.changes.map((c) => [c.date, c.kind, c.after, c.english_switched]),
    [
      ['2026-10-30', 'skip', [], []],
      ['2026-11-01', 'adjust', [{ platform: 'tiktok', language: 'en' }], ['tiktok']],
    ],
  );
  assert.deepEqual(plan.counts, { adjusted: 1, skipped: 1 });
  assert.deepEqual(await lineOf(slots['2026-11-01']!), { status: 'validated', platforms: [{ platform: 'tiktok', language: 'en' }], skipReason: null });
});

test('planRhythm refuses a week that is not validated, or unknown', async () => {
  const week = await createContentWeek(prisma, { startsOn: new Date('2026-10-26'), status: 'titles_ready' });
  await assert.rejects(planRhythm(week.id, WEDNESDAY), isHttp(409, 'invalid_transition'));
  await assert.rejects(applyRhythm(week.id, actor, WEDNESDAY), isHttp(409, 'invalid_transition'));
  await assert.rejects(planRhythm(randomUUID(), WEDNESDAY), isHttp(404, 'week_not_found'));
});

test('a line listing its platforms in another order already follows the rhythm', async () => {
  assert.equal(samePosts([{ platform: 'tiktok', language: 'fr' }, { platform: 'linkedin', language: 'en' }], [{ platform: 'linkedin', language: 'en' }, { platform: 'tiktok', language: 'fr' }]), true);
  assert.equal(samePosts([{ platform: 'linkedin', language: 'fr' }], [{ platform: 'linkedin', language: 'en' }]), false, 'the language counts');
  // Wednesday is stored [tiktok, linkedin]; the cadence plans [linkedin, tiktok]: nothing to adjust.
  const lines: Line[] = DEFAULT_LINES.map(([date, posts]): Line => [date, date === '2026-10-28' ? [...posts].reverse() : posts]);
  const { weekId } = await validatedWeek(lines);
  // Planned on Tuesday 27: Wednesday is still to come.
  assert.deepEqual((await planRhythm(weekId, new Date('2026-10-27T09:00:00Z'))).changes, []);
});

test('the English minimum is restored even when the week was already below it', async () => {
  // Validated with an override: TikTok has no English post at all.
  const lines: Line[] = DEFAULT_LINES.map(([date, posts]) => [date, posts.map(([p, l]): [ContentPlatform, ContentLanguage] => [p, p === 'tiktok' ? 'fr' : l])]);
  const { weekId, slots } = await validatedWeek(lines);
  const { plan } = await applyRhythm(weekId, actor, WEDNESDAY);
  assert.deepEqual(
    plan.changes.map((c) => [c.date, c.after, c.english_switched]),
    [['2026-10-30', [{ platform: 'tiktok', language: 'en' }], ['tiktok']]],
  );
  assert.deepEqual(plan.english_missing, []);
  assert.deepEqual((await lineOf(slots['2026-10-30']!)).platforms, [{ platform: 'tiktok', language: 'en' }]);
  assert.deepEqual((await planRhythm(weekId, WEDNESDAY)).changes, [], 'then nothing is left to do');
});

test('a day that fails mid-way: the applied days stay, the week audit says what failed, a re-run finishes', async () => {
  const { weekId, slots } = await validatedWeek();
  await setCadence({ linkedin: [1, 5], tiktok: [4, 6] });
  // Thursday and Friday adjust, then Sunday's skip fails (as if it changed meanwhile).
  const failingSkip: typeof skipDay = async () => {
    throw new HttpError(409, 'invalid_transition', 'Ce jour vient de changer. Rechargez la page.');
  };
  await assert.rejects(applyRhythm(weekId, actor, WEDNESDAY, { updateSlot, skipDay: failingSkip }), isHttp(409, 'invalid_transition'));
  assert.equal((await lineOf(slots['2026-10-29']!)).status, 'validated');
  assert.deepEqual((await lineOf(slots['2026-10-30']!)).platforms, [{ platform: 'linkedin', language: 'fr' }]);
  assert.equal((await lineOf(slots['2026-11-01']!)).status, 'validated', 'the failed day is unchanged');
  const first = await prisma.auditLog.findFirstOrThrow({ where: { kind: 'content.week.apply_rhythm' } });
  const diff = first.diff as { adjusted: number; skipped: number; planned: object; failed: { date: string; error: string } };
  assert.deepEqual([diff.adjusted, diff.skipped], [2, 0]);
  assert.deepEqual(diff.planned, { adjusted: 2, skipped: 1 });
  assert.equal(diff.failed.date, '2026-11-01');

  const rerun = await applyRhythm(weekId, actor, WEDNESDAY);
  assert.deepEqual(rerun.applied, { adjusted: 0, skipped: 1 });
  assert.equal((await lineOf(slots['2026-11-01']!)).skipReason, 'Nouveau rythme');
  assert.equal(await prisma.auditLog.count({ where: { kind: 'content.week.apply_rhythm' } }), 2);
  assert.deepEqual((await planRhythm(weekId, WEDNESDAY)).changes, []);
});
