import '../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createContentDraft, createContentSlot, createContentWeek, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import type { ContentLanguage } from '@gabee/types';
import { setErrorReporterForTests } from '../report-error';
import { HttpError } from '../http';
import { FakeAiAdapter, resetAiAdapters, setAiAdapters, type FakeAiStep } from '../ai/router';
import type { Actor } from './state';
import { chooseDirection, getWeek, proposeDirections, regenerateSlot, skipDay, startWeek, updateSlot, validateWeek } from './weeks';

const prisma = createTestClient();
const actor: Actor = { id: randomUUID(), role: 'admin' };
let reported: unknown[] = [];

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  reported = [];
  setErrorReporterForTests((err) => reported.push(err));
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  resetAiAdapters();
  setErrorReporterForTests(null);
  mock.restoreAll();
});
after(async () => prisma.$disconnect());

function fake(script: FakeAiStep[]): FakeAiAdapter {
  const adapter = new FakeAiAdapter(script);
  setAiAdapters([adapter]);
  return adapter;
}

const proposals = {
  proposals: [0, 1, 2].map((i) => ({ title: `Direction ${i}`, rationale: 'r', evidence: ['e'], sample_angles: ['a'] })),
};

function titlesFor(dates: string[], lang: (i: number) => [ContentLanguage, ContentLanguage] = (i) => (i < 2 ? ['en', 'en'] : ['fr', 'fr'])) {
  return {
    days: dates.map((date, i) => ({
      date,
      topic: `Sujet ${date}`,
      angle: `Angle ${i}`,
      format: 'text',
      platforms: [
        { platform: 'linkedin', language: lang(i)[0] },
        { platform: 'tiktok', language: lang(i)[1] },
      ],
      sources: [],
    })),
  };
}

const isHttp = (status: number, code: string) => (err: unknown) => err instanceof HttpError && err.status === status && err.code === code;

async function audits(kind: string) {
  return prisma.auditLog.findMany({ where: { kind } });
}

test('startWeek mid-week creates a partial week starting tomorrow', async () => {
  const adapter = fake([{ json: proposals }]);
  // Wednesday 2026-10-21 10:00 in Douala (UTC+1).
  const week = await startWeek({ now: new Date('2026-10-21T09:00:00Z'), origin: 'user_action', actor });
  assert.equal(week.starts_on, '2026-10-19');
  assert.equal(week.first_day, '2026-10-22');
  assert.equal(week.days_in_week, 4);
  assert.equal(week.status, 'proposals_ready');
  assert.equal(week.proposals?.length, 3);
  assert.equal(adapter.calls[0]!.req.task, 'content_strategy');
  const row = await prisma.contentWeek.findUniqueOrThrow({ where: { id: week.id } });
  assert.equal(row.startsOn.toISOString(), '2026-10-19T00:00:00.000Z');
  assert.equal((await audits('content.week.start')).length, 1);

  await assert.rejects(startWeek({ now: new Date('2026-10-21T10:00:00Z'), origin: 'user_action', actor }), isHttp(409, 'week_exists'));
});

test('startWeek uses the studio-local day: Sunday plans next week, Monday 00:30 local is Monday', async () => {
  fake([{ json: proposals }, { json: proposals }]);
  // Sunday 2026-10-25 22:00 UTC = Sunday 23:00 in Douala → next Monday, full week.
  const sunday = await startWeek({ now: new Date('2026-10-25T22:00:00Z'), origin: 'scheduled_job' });
  assert.equal(sunday.starts_on, '2026-10-26');
  assert.equal(sunday.first_day, '2026-10-26');
  assert.equal(sunday.days_in_week, 7);
  assert.equal((await audits('content.week.start')).length, 0, 'scheduled origin writes no audit row');

  // Sunday 2026-11-01 23:30 UTC = Monday 2026-11-02 00:30 in Douala → current week from Tuesday.
  const monday = await startWeek({ now: new Date('2026-11-01T23:30:00Z'), origin: 'user_action', actor });
  assert.equal(monday.starts_on, '2026-11-02');
  assert.equal(monday.first_day, '2026-11-03');
});

test('startWeek keeps the week proposing when the strategist fails', async () => {
  fake([{ error: 'refusal' }]);
  await assert.rejects(startWeek({ now: new Date('2026-10-21T09:00:00Z'), origin: 'user_action', actor }));
  const row = await prisma.contentWeek.findFirstOrThrow();
  assert.equal(row.status, 'proposing');
});

test('chooseDirection plans one slot per day from firstDay to Sunday', async () => {
  const dates = ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];
  const adapter = fake([{ json: proposals }, { json: titlesFor(dates) }]);
  const started = await startWeek({ now: new Date('2026-10-21T09:00:00Z'), origin: 'user_action', actor });
  const week = await chooseDirection(started.id, { proposal_index: 2, refinement: 'Plus concret', platform_angles: { tiktok: 'Le jeu en vrai' } }, actor);
  assert.equal(week.status, 'titles_ready');
  assert.equal(week.chosen_index, 2);
  assert.equal(week.refinement, 'Plus concret');
  assert.deepEqual(week.platform_angles, { tiktok: 'Le jeu en vrai' });
  assert.deepEqual(
    week.slots.map((s) => [s.date, s.status]),
    dates.map((d) => [d, 'proposed']),
  );
  assert.deepEqual(week.slots[0]!.platforms, [
    { platform: 'linkedin', language: 'en' },
    { platform: 'tiktok', language: 'en' },
  ]);
  assert.equal(adapter.calls[1]!.req.task, 'content_titles');
  assert.equal((await audits('content.week.direction')).length, 1);
});

async function titledWeek(lang: (i: number) => [ContentLanguage, ContentLanguage]) {
  const dates = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
  fake([{ json: proposals }, { json: titlesFor(dates, lang) }]);
  const started = await startWeek({ now: new Date('2026-10-25T07:00:00Z'), origin: 'scheduled_job' });
  return chooseDirection(started.id, { proposal_index: 0, refinement: '', platform_angles: {} }, actor);
}

test('validateWeek blocks when tiktok has one english post', async () => {
  // LinkedIn: 2 English days; TikTok: only day 0 in English.
  const week = await titledWeek((i) => [i < 2 ? 'en' : 'fr', i === 0 ? 'en' : 'fr']);
  await assert.rejects(validateWeek(week.id, actor), (err: unknown) => {
    assert.ok(isHttp(409, 'language_quota')(err));
    assert.deepEqual((err as HttpError).details, [
      { platform: 'linkedin', english: 2, required: 2, ok: true },
      { platform: 'tiktok', english: 1, required: 2, ok: false },
    ]);
    return true;
  });
  assert.equal((await getWeek(week.id)).status, 'titles_ready');
});

test('validateWeek passes with overrideQuota', async () => {
  const week = await titledWeek((i) => [i < 2 ? 'en' : 'fr', i === 0 ? 'en' : 'fr']);
  const validated = await validateWeek(week.id, actor, { overrideQuota: true });
  assert.equal(validated.status, 'validated');
  assert.ok(validated.slots.every((s) => s.status === 'validated'));
  const [audit] = await audits('content.week.validate');
  assert.deepEqual((audit!.diff as { override_quota: boolean }).override_quota, true);
  await assert.rejects(validateWeek(week.id, actor), isHttp(409, 'invalid_transition'));
});

test('validateWeek ignores skipped slots for the quota', async () => {
  const week = await titledWeek((i) => (i < 2 ? ['en', 'en'] : ['fr', 'fr']));
  await skipDay(week.slots[0]!.id, 'Jour férié', actor);
  await assert.rejects(validateWeek(week.id, actor), isHttp(409, 'language_quota'));
});

test('editing a slot marks its drafts stale', async () => {
  const week = await createContentWeek(prisma, { startsOn: new Date('2026-10-26'), status: 'validated' });
  const slot = await createContentSlot(prisma, week.id, { status: 'drafted' });
  const ready = await createContentDraft(prisma, slot.id, { platform: 'linkedin', status: 'ready' });
  const approved = await createContentDraft(prisma, slot.id, { platform: 'tiktok', status: 'approved' });
  const other = await createContentSlot(prisma, week.id, { status: 'drafted' });
  const published = await createContentDraft(prisma, other.id, { platform: 'linkedin', status: 'published' });

  const updated = await updateSlot(slot.id, { topic: 'Nouveau sujet', platforms: [{ platform: 'linkedin', language: 'en' }, { platform: 'tiktok', language: 'fr' }] }, actor);
  assert.equal(updated.topic, 'Nouveau sujet');
  assert.deepEqual(
    updated.drafts.map((d) => [d.id, d.status]).sort(),
    [
      [ready.id, 'stale'],
      [approved.id, 'stale'],
    ].sort(),
  );
  assert.equal((await prisma.contentDraft.findUniqueOrThrow({ where: { id: published.id } })).status, 'published');
  assert.equal((await audits('content.slot.update')).length, 1);

  await assert.rejects(updateSlot(slot.id, { platforms: [{ platform: 'linkedin', language: 'en' }, { platform: 'linkedin', language: 'fr' }] }, actor), isHttp(422, 'invalid_platforms'));
});

test('regenerateSlot replaces the line with the strategist output for that day and marks drafts stale', async () => {
  const week = await titledWeek((i) => (i < 2 ? ['en', 'en'] : ['fr', 'fr']));
  await validateWeek(week.id, actor);
  const target = week.slots[3]!;
  const draft = await createContentDraft(prisma, target.id, { platform: 'linkedin', status: 'ready' });

  const dates = week.slots.map((s) => s.date);
  const fresh = titlesFor(dates);
  fresh.days[3] = { ...fresh.days[3]!, topic: 'Sujet régénéré', angle: 'Nouvel angle' };
  fake([{ json: fresh }]);
  const slot = await regenerateSlot(target.id, actor);
  assert.equal(slot.topic, 'Sujet régénéré');
  assert.equal(slot.angle, 'Nouvel angle');
  assert.equal(slot.status, 'validated');
  assert.equal((await prisma.contentDraft.findUniqueOrThrow({ where: { id: draft.id } })).status, 'stale');
  // Other days are untouched.
  assert.equal((await getWeek(week.id)).slots[2]!.topic, week.slots[2]!.topic);
  assert.equal((await audits('content.slot.regenerate')).length, 1);
});

test('skipDay records the reason and refuses a done slot', async () => {
  const week = await createContentWeek(prisma, { startsOn: new Date('2026-10-26'), status: 'validated' });
  const slot = await createContentSlot(prisma, week.id, { status: 'validated' });
  const skipped = await skipDay(slot.id, 'Jour férié', actor);
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.skip_reason, 'Jour férié');
  assert.equal((await audits('content.slot.skip')).length, 1);
  const done = await createContentSlot(prisma, week.id, { status: 'done' });
  await assert.rejects(skipDay(done.id, 'x', actor), isHttp(409, 'invalid_transition'));
  assert.equal(reported.length, 0);
});

// ── Ruling 15: one paid Strategist run per week at a time ──

async function strategistRun(weekId: string, subjectKind: 'week_proposals' | 'week_titles', minutesAgo: number, status = 'running') {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { key: 'strategist' } });
  return prisma.agentRun.create({
    data: {
      agentKey: 'strategist',
      agentVersionId: agent.publishedVersionId!,
      origin: 'user_action',
      subjectKind,
      subjectId: weekId,
      inputHash: 'h',
      input: {},
      status,
      startedAt: new Date(Date.now() - minutesAgo * 60_000),
    },
  });
}

test('propose, direction and slot regenerate refuse while a strategist run on the week is live', async () => {
  const proposing = await createContentWeek(prisma, { status: 'proposing' });
  const ready = await createContentWeek(prisma, { status: 'proposals_ready', proposals });
  const titled = await titledWeek((i) => (i < 2 ? ['en', 'en'] : ['fr', 'fr']));
  await strategistRun(proposing.id, 'week_proposals', 2);
  await strategistRun(ready.id, 'week_titles', 0);
  await strategistRun(titled.id, 'week_titles', 19); // a slow call (180 s × 2 SDK attempts, + runAgent retry) is still live
  const adapter = fake([]);

  const inProgress = (err: unknown) =>
    isHttp(409, 'generation_in_progress')(err) && /Attendez la fin/.test((err as HttpError).message) && /dans 20 minutes/.test((err as HttpError).message);
  await assert.rejects(proposeDirections(proposing.id, 'user_action', actor), inProgress);
  await assert.rejects(chooseDirection(ready.id, { proposal_index: 1, refinement: '', platform_angles: {} }, actor), inProgress);
  await assert.rejects(regenerateSlot(titled.slots[2]!.id, actor), inProgress);

  // Nothing was paid for and nothing changed.
  assert.equal(adapter.calls.length, 0);
  assert.equal((await prisma.contentWeek.findUniqueOrThrow({ where: { id: proposing.id } })).status, 'proposing');
  const readyRow = await prisma.contentWeek.findUniqueOrThrow({ where: { id: ready.id } });
  assert.equal(readyRow.status, 'proposals_ready');
  assert.equal(readyRow.chosenIndex, null);
  assert.equal((await getWeek(titled.id)).slots[2]!.topic, titled.slots[2]!.topic);
  assert.equal((await audits('content.week.direction')).length, 1); // titledWeek's own choice only
});

test('a crashed (over 20 min) or finished strategist run does not block the week', async () => {
  const week = await createContentWeek(prisma, { status: 'proposing' });
  await strategistRun(week.id, 'week_proposals', 21); // crashed: still "running" but too old
  await strategistRun(week.id, 'week_proposals', 1, 'failed');
  const other = await createContentWeek(prisma, { status: 'proposing' });
  await strategistRun(other.id, 'week_proposals', 1); // another week's live run
  fake([{ json: proposals }]);
  const out = await proposeDirections(week.id, 'user_action', actor);
  assert.equal(out.status, 'proposals_ready');
  // The crashed run was closed so it no longer holds the week.
  const runs = await prisma.agentRun.findMany({ where: { subjectId: week.id }, orderBy: { startedAt: 'asc' } });
  assert.deepEqual(
    runs.map((r) => [r.status, r.errorCode]),
    [
      ['failed', 'abandoned'],
      ['failed', null],
      ['succeeded', null],
    ],
  );
  assert.ok(runs[0]!.finishedAt);
});

test('two concurrent proposal runs on a week: the database lets exactly one call the AI', async () => {
  const week = await createContentWeek(prisma, { status: 'proposing' });
  // Hold the AI call so both requests are in flight at once (both pass the early check).
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const adapter = fake([{ json: proposals }, { json: proposals }]);
  const call = adapter.call.bind(adapter);
  adapter.call = async (...args) => {
    await gate;
    return call(...args);
  };
  const runs = [proposeDirections(week.id, 'user_action', actor), proposeDirections(week.id, 'user_action', actor)];
  // Let both reach run creation; the loser is refused there, before any AI call.
  const settled = Promise.allSettled(runs);
  await new Promise((r) => setTimeout(r, 300));
  release();
  const results = await settled;

  assert.equal(adapter.calls.length, 1, 'exactly one paid call');
  const ok = results.filter((r) => r.status === 'fulfilled');
  const refused = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  assert.equal(ok.length, 1);
  assert.equal(refused.length, 1);
  assert.ok(isHttp(409, 'generation_in_progress')(refused[0]!.reason), String(refused[0]!.reason));
  assert.equal(await prisma.agentRun.count({ where: { subjectId: week.id } }), 1);
  assert.equal(reported.length, 0, 'the refusal is not an incident');
});

test('the database refuses a second running row for the same week, across both week kinds', async () => {
  const week = await createContentWeek(prisma, { status: 'proposing' });
  await strategistRun(week.id, 'week_proposals', 0);
  await assert.rejects(strategistRun(week.id, 'week_titles', 0), (err: unknown) => (err as { code?: string }).code === 'P2002');
  // Finished runs do not count, nor do other subject kinds.
  await strategistRun(week.id, 'week_titles', 0, 'succeeded');
  const other = await createContentWeek(prisma, { status: 'proposing' });
  await strategistRun(other.id, 'week_proposals', 0);
});
