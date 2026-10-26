import '../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createContentDraft, createContentSlot, createContentWeek, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import { DEFAULT_POSTING_DAYS, type ContentPillar, type ContentPlatform } from '@gabee/types';
import { setErrorReporterForTests } from '../report-error';
import { HttpError } from '../http';
import { resetAiAdapters, setAiAdapters } from '../ai/router';
import { FakeAiAdapter, type FakeAiStep } from '../ai/router/fake-adapter';
import { plannedDays, type PlannedDay } from './cadence';
import type { Actor } from './state';
import { chooseDirection, getWeek, proposeDirections, regenerateProposals, regenerateSlot, skipDay, startWeek, updateSlot, validateWeek, type WeekDto } from './weeks';

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

const BOTH: ContentPlatform[] = ['linkedin', 'tiktok'];
/** The default cadence's days from `firstDay` to Sunday (LinkedIn Tue–Thu, TikTok Mon/Wed/Fri/Sun). */
const cadence = (startsOn: string, firstDay = startsOn) => plannedDays(startsOn, firstDay, DEFAULT_POSTING_DAYS, BOTH);
/** The days a week's lines already plan (what a day regenerate re-plans). */
const linesOf = (week: WeekDto): PlannedDay[] => week.slots.map((s) => ({ date: s.date, platforms: s.platforms.map((p) => p.platform) }));
/** The mix a valid plan keeps: day 1 light, day 2 about Gabee, the rest useful content. */
const defaultPillar = (i: number): ContentPillar => (i === 0 ? 'light' : i === 1 ? 'gabee' : 'value');

/**
 * A titles answer for `plan`: each day with exactly its platforms. By default
 * the first two days are in English (so each platform of the default cadence
 * gets one English post: TikTok on Monday, LinkedIn on Tuesday).
 */
function titlesFor(
  plan: PlannedDay[],
  en: (i: number, platform: ContentPlatform) => boolean = (i) => i < 2,
  pillar: (i: number) => ContentPillar = defaultPillar,
) {
  return {
    days: plan.map(({ date, platforms }, i) => ({
      date,
      topic: `Sujet ${date}`,
      angle: `Angle ${i}`,
      format: 'text',
      pillar: pillar(i),
      platforms: platforms.map((platform) => ({ platform, language: en(i, platform) ? 'en' : 'fr' })),
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

/** The task block a titles call received, parsed. */
function titlesTask(adapter: FakeAiAdapter, call: number) {
  const b = adapter.calls[call]!.req.blocks.find((x) => x.kind === 'text' && x.label === 'task');
  if (!b || b.kind !== 'text') return assert.fail(`call ${call} has no task block`);
  return JSON.parse(b.text.replace(/^<block label="task">\n/, '').replace(/\n<\/block>$/, '')) as {
    dates: string[];
    days: { date: string; weekday: string; platforms: string[] }[];
    english_min_per_platform: Record<string, number>;
    pillar_mix: { gabee_max: number; light_min: number };
  };
}

test('chooseDirection plans a partial week on the posting days from firstDay to Sunday', async () => {
  // Launched on Wednesday 21 Oct: Thursday (LinkedIn), Friday and Sunday (TikTok); nothing posts on Saturday.
  const plan = cadence('2026-10-19', '2026-10-22');
  assert.deepEqual(plan, [
    { date: '2026-10-22', platforms: ['linkedin'] },
    { date: '2026-10-23', platforms: ['tiktok'] },
    { date: '2026-10-25', platforms: ['tiktok'] },
  ]);
  const adapter = fake([{ json: proposals }, { json: titlesFor(plan) }]);
  const started = await startWeek({ now: new Date('2026-10-21T09:00:00Z'), origin: 'user_action', actor });
  const week = await chooseDirection(started.id, { proposal_index: 2, refinement: 'Plus concret', platform_angles: { tiktok: 'Le jeu en vrai' } }, actor);
  assert.equal(week.status, 'titles_ready');
  assert.equal(week.chosen_index, 2);
  assert.equal(week.refinement, 'Plus concret');
  assert.deepEqual(week.platform_angles, { tiktok: 'Le jeu en vrai' });
  assert.deepEqual(
    week.slots.map((s) => [s.date, s.status, s.pillar, s.platforms]),
    [
      ['2026-10-22', 'proposed', 'light', [{ platform: 'linkedin', language: 'en' }]],
      ['2026-10-23', 'proposed', 'gabee', [{ platform: 'tiktok', language: 'en' }]],
      ['2026-10-25', 'proposed', 'value', [{ platform: 'tiktok', language: 'fr' }]],
    ],
  );
  assert.deepEqual(week.mix, { gabee: 1, light: 1, value: 1, ok: true, problems: [] });
  assert.equal(adapter.calls[1]!.req.task, 'content_titles');
  const task = titlesTask(adapter, 1);
  assert.deepEqual(task.dates, ['2026-10-22', '2026-10-23', '2026-10-25']);
  assert.deepEqual(task.days.map((d) => [d.weekday, d.platforms]), [
    ['thursday', ['linkedin']],
    ['friday', ['tiktok']],
    ['sunday', ['tiktok']],
  ]);
  // Partial week: one LinkedIn post needs no English post; TikTok's two need one.
  assert.deepEqual(task.english_min_per_platform, { linkedin: 0, tiktok: 1 });
  assert.deepEqual(task.pillar_mix, { gabee_max: 3, light_min: 1 });
  assert.equal((await audits('content.week.direction')).length, 1);
});

test('the Sunday run plans the full week on the posting days in Réglages', async () => {
  await prisma.studioSettings.update({ where: { id: 'default' }, data: { postingDays: { linkedin: [1, 4], tiktok: [4, 6] } } });
  const plan = cadence('2026-10-26');
  const custom = plannedDays('2026-10-26', '2026-10-26', { linkedin: [1, 4], tiktok: [4, 6] }, BOTH);
  assert.notDeepEqual(custom, plan);
  const adapter = fake([{ json: proposals }, { json: titlesFor(custom) }]);
  // Sunday 25 Oct 07:00 in Douala plans the week of Monday 26.
  const started = await startWeek({ now: new Date('2026-10-25T06:00:00Z'), origin: 'scheduled_job' });
  assert.equal(started.days_in_week, 7);
  const week = await chooseDirection(started.id, { proposal_index: 0, refinement: '', platform_angles: {} }, actor);
  assert.deepEqual(
    week.slots.map((s) => [s.date, s.platforms.map((p) => p.platform)]),
    [
      ['2026-10-26', ['linkedin']],
      ['2026-10-29', ['linkedin', 'tiktok']],
      ['2026-10-31', ['tiktok']],
    ],
  );
  assert.deepEqual(titlesTask(adapter, 1).english_min_per_platform, { linkedin: 1, tiktok: 1 });
});

test('a disabled platform plans no day of its own', async () => {
  await prisma.studioSettings.update({ where: { id: 'default' }, data: { enabledPlatforms: ['tiktok'] } });
  const plan = plannedDays('2026-10-26', '2026-10-26', DEFAULT_POSTING_DAYS, ['tiktok']);
  assert.deepEqual(plan.map((d) => d.date), ['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-01']);
  const adapter = fake([{ json: proposals }, { json: titlesFor(plan) }]);
  const started = await startWeek({ now: new Date('2026-10-25T06:00:00Z'), origin: 'scheduled_job' });
  const week = await chooseDirection(started.id, { proposal_index: 0, refinement: '', platform_angles: {} }, actor);
  assert.equal(week.slots.length, 4);
  assert.deepEqual(titlesTask(adapter, 1).english_min_per_platform, { tiktok: 1 });
});

test('startWeek refuses a partial week in which no platform posts any more, before any AI call', async () => {
  await prisma.studioSettings.update({ where: { id: 'default' }, data: { postingDays: { linkedin: [1], tiktok: [2] } } });
  const adapter = fake([]);
  // Wednesday 21 Oct: Thursday to Sunday have no posting day.
  await assert.rejects(startWeek({ now: new Date('2026-10-21T09:00:00Z'), origin: 'user_action', actor }), isHttp(409, 'no_posting_days'));
  assert.equal(await prisma.contentWeek.count(), 0);
  assert.equal(adapter.calls.length, 0);
});

test('a titles plan on the wrong days or platforms is invalid: retried once with feedback, then refused', async () => {
  const plan = cadence('2026-10-26');
  const sevenDays = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map((date) => ({ date, platforms: BOTH }));
  const adapter = fake([{ json: proposals }, { json: titlesFor(sevenDays) }, { json: titlesFor(plan) }]);
  const started = await startWeek({ now: new Date('2026-10-25T06:00:00Z'), origin: 'scheduled_job' });
  const week = await chooseDirection(started.id, { proposal_index: 0, refinement: '', platform_angles: {} }, actor);
  assert.equal(week.slots.length, 6, 'the retry planned the posting days');
  const feedback = adapter.calls[2]!.req.blocks.find((b) => b.kind === 'text' && b.label === 'retry_feedback');
  assert.ok(feedback && feedback.kind === 'text');
  assert.match(feedback.text, /days must cover exactly 2026-10-26, 2026-10-27, 2026-10-28, 2026-10-29, 2026-10-30, 2026-11-01/);

  // Both answers put both platforms on every day: the run is refused and the week waits for another choice.
  const other = await createContentWeek(prisma, { startsOn: new Date('2026-11-02'), status: 'proposals_ready', proposals });
  const wrong = titlesFor(cadence('2026-11-02').map((d) => ({ ...d, platforms: BOTH })));
  const refused = fake([{ json: wrong }, { json: wrong }]);
  await assert.rejects(chooseDirection(other.id, { proposal_index: 0, refinement: '', platform_angles: {} }, actor), (err: unknown) => (err as Error).name === 'AgentRulesError');
  assert.equal(refused.calls.length, 2);
  assert.equal((await prisma.contentWeek.findUniqueOrThrow({ where: { id: other.id } })).status, 'direction_set');
  assert.equal(await prisma.contentSlot.count({ where: { weekId: other.id } }), 0);
});

test('a titles plan that breaks the mix (over 3 days on Gabee, or no light day) is retried, then refused', async () => {
  const plan = cadence('2026-10-26');
  const allGabee = titlesFor(plan, undefined, (i) => (i < 4 ? 'gabee' : 'light'));
  const noLight = titlesFor(plan, undefined, (i) => (i === 0 ? 'gabee' : 'value'));
  const adapter = fake([{ json: proposals }, { json: allGabee }, { json: titlesFor(plan) }]);
  const started = await startWeek({ now: new Date('2026-10-25T06:00:00Z'), origin: 'scheduled_job' });
  const week = await chooseDirection(started.id, { proposal_index: 0, refinement: '', platform_angles: {} }, actor);
  assert.deepEqual(week.mix, { gabee: 1, light: 1, value: 4, ok: true, problems: [] });
  const feedback = adapter.calls[2]!.req.blocks.find((b) => b.kind === 'text' && b.label === 'retry_feedback');
  assert.ok(feedback && feedback.kind === 'text' && /4 days have pillar "gabee": at most 3/.test(feedback.text));

  // Twice without a light day: refused, nothing stored.
  const again = fake([{ json: noLight }, { json: noLight }]);
  await assert.rejects(chooseDirection(week.id, { proposal_index: 1, refinement: '', platform_angles: {} }, actor), (err: unknown) => (err as Error).name === 'AgentRulesError');
  assert.equal(again.calls.length, 2);
  const row = await prisma.contentWeek.findUniqueOrThrow({ where: { id: week.id }, include: { slots: true } });
  assert.equal(row.status, 'direction_set');
  assert.equal(row.slots.length, 0);
});

async function titledWeek(en: (i: number, platform: ContentPlatform) => boolean = (i) => i < 2) {
  fake([{ json: proposals }, { json: titlesFor(cadence('2026-10-26'), en) }]);
  const started = await startWeek({ now: new Date('2026-10-25T07:00:00Z'), origin: 'scheduled_job' });
  return chooseDirection(started.id, { proposal_index: 0, refinement: '', platform_angles: {} }, actor);
}

test('validateWeek needs one English post per platform on a full week', async () => {
  // LinkedIn posts Tue–Thu in English twice; TikTok (Mon/Wed/Fri/Sun) never.
  const week = await titledWeek((i, p) => p === 'linkedin' && i >= 2);
  await assert.rejects(validateWeek(week.id, actor), (err: unknown) => {
    assert.ok(isHttp(409, 'language_quota')(err));
    assert.deepEqual((err as HttpError).details, [
      { platform: 'linkedin', posts: 3, english: 2, required: 1, ok: true },
      { platform: 'tiktok', posts: 4, english: 0, required: 1, ok: false },
    ]);
    return true;
  });
  assert.equal((await getWeek(week.id)).status, 'titles_ready');

  // One English TikTok post is enough (it was two before 26 Oct).
  const wed = week.slots.find((s) => s.date === '2026-10-28')!;
  await updateSlot(wed.id, { platforms: [{ platform: 'linkedin', language: 'en' }, { platform: 'tiktok', language: 'en' }] }, actor);
  assert.equal((await validateWeek(week.id, actor)).status, 'validated');
});

test('validateWeek on a partial week asks English only of a platform with 2 posts or more', async () => {
  const week = await createContentWeek(prisma, { startsOn: new Date('2026-10-26'), firstDay: new Date('2026-10-29'), status: 'titles_ready' });
  await createContentSlot(prisma, week.id, { date: new Date('2026-10-29'), platforms: [{ platform: 'linkedin', language: 'fr' }], status: 'proposed' });
  await createContentSlot(prisma, week.id, { date: new Date('2026-10-30'), platforms: [{ platform: 'tiktok', language: 'fr' }], status: 'proposed' });
  const sunday = await createContentSlot(prisma, week.id, { date: new Date('2026-11-01'), platforms: [{ platform: 'tiktok', language: 'fr' }], status: 'proposed' });
  await assert.rejects(validateWeek(week.id, actor), (err: unknown) => {
    assert.deepEqual((err as HttpError).details, [
      { platform: 'linkedin', posts: 1, english: 0, required: 0, ok: true },
      { platform: 'tiktok', posts: 2, english: 0, required: 1, ok: false },
    ]);
    return true;
  });
  await updateSlot(sunday.id, { platforms: [{ platform: 'tiktok', language: 'en' }] }, actor);
  assert.equal((await validateWeek(week.id, actor)).status, 'validated');
});

test('validateWeek passes with overrideQuota', async () => {
  const week = await titledWeek(() => false);
  const validated = await validateWeek(week.id, actor, { overrideQuota: true });
  assert.equal(validated.status, 'validated');
  assert.ok(validated.slots.every((s) => s.status === 'validated'));
  const [audit] = await audits('content.week.validate');
  assert.deepEqual((audit!.diff as { override_quota: boolean }).override_quota, true);
  await assert.rejects(validateWeek(week.id, actor), isHttp(409, 'invalid_transition'));
});

test('validateWeek ignores skipped slots for the quota', async () => {
  // TikTok's only English post is Monday's.
  const week = await titledWeek();
  await skipDay(week.slots[0]!.id, 'Jour férié', actor);
  await assert.rejects(validateWeek(week.id, actor), isHttp(409, 'language_quota'));
});

test('an owner pillar edit is saved, marks the drafts stale, and the week flags a broken mix without blocking', async () => {
  const week = await titledWeek();
  assert.deepEqual(week.mix, { gabee: 1, light: 1, value: 4, ok: true, problems: [] });
  const light = week.slots.find((s) => s.pillar === 'light')!;
  const updated = await updateSlot(light.id, { pillar: 'gabee' }, actor);
  assert.equal(updated.pillar, 'gabee');
  const after = await getWeek(week.id);
  assert.deepEqual(after.mix, { gabee: 2, light: 0, value: 4, ok: false, problems: ['no_light'] });
  const [audit] = await audits('content.slot.update');
  assert.deepEqual((audit!.diff as { before: { pillar: string }; after: object }).before.pillar, 'light');
  assert.deepEqual((audit!.diff as { after: object }).after, { pillar: 'gabee' });
  // A broken mix is the owner's call: the week still validates.
  assert.equal((await validateWeek(week.id, actor)).status, 'validated');

  // On a validated day, the drafts written for the old pillar no longer match.
  const day = after.slots[3]!;
  const draft = await createContentDraft(prisma, day.id, { platform: day.platforms[0]!.platform, status: 'approved' });
  await updateSlot(day.id, { pillar: 'light' }, actor);
  assert.equal((await prisma.contentDraft.findUniqueOrThrow({ where: { id: draft.id } })).status, 'stale');
  assert.equal((await getWeek(week.id)).mix.ok, true);
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
  const week = await titledWeek();
  await validateWeek(week.id, actor);
  const target = week.slots[3]!;
  const draft = await createContentDraft(prisma, target.id, { platform: 'linkedin', status: 'ready' });
  // The owner moved Thursday to TikTok: a regenerate re-plans the week's lines as they are now.
  await updateSlot(target.id, { platforms: [{ platform: 'tiktok', language: 'fr' }] }, actor);
  const lines = linesOf(await getWeek(week.id));
  assert.deepEqual(lines[3], { date: '2026-10-29', platforms: ['tiktok'] });

  const fresh = titlesFor(lines, undefined, (i) => (i === 3 ? 'light' : i === 0 ? 'gabee' : 'value'));
  fresh.days[3] = { ...fresh.days[3]!, topic: 'Sujet régénéré', angle: 'Nouvel angle' };
  const adapter = fake([{ json: fresh }]);
  const slot = await regenerateSlot(target.id, actor);
  assert.deepEqual(titlesTask(adapter, 0).days.map((d) => d.platforms), lines.map((d) => d.platforms));
  assert.equal(slot.topic, 'Sujet régénéré');
  assert.equal(slot.angle, 'Nouvel angle');
  assert.equal(slot.pillar, 'light');
  assert.equal(slot.status, 'validated');
  assert.equal((await prisma.contentDraft.findUniqueOrThrow({ where: { id: draft.id } })).status, 'stale');
  // Other days are untouched.
  assert.equal((await getWeek(week.id)).slots[2]!.topic, week.slots[2]!.topic);
  assert.equal((await audits('content.slot.regenerate')).length, 1);
});

const objectiveText = (adapter: FakeAiAdapter, call: number) => {
  const b = adapter.calls[call]!.req.blocks.find((x) => x.kind === 'text' && x.label === 'objective');
  return b && b.kind === 'text' ? b.text : assert.fail(`call ${call} has no objective block`);
};

test('titles and slot regenerate read the month objective set after the week started, and re-link the week', async () => {
  const plan = cadence('2026-10-26');
  const adapter = fake([{ json: proposals }, { json: titlesFor(plan) }]);
  // The Sunday run for the week of Mon 26 Oct, before any October objective existed.
  const started = await startWeek({ now: new Date('2026-10-25T05:00:00Z'), origin: 'scheduled_job' });
  assert.equal(started.objective_id, null);
  assert.match(objectiveText(adapter, 0), /no objective is set/);

  // The owner sets October's objective afterwards, then picks a direction.
  const objective = await prisma.contentObjective.create({ data: { month: '2026-10', type: 'signups', statement: 'Cinquante familles' } });
  const titled = await chooseDirection(started.id, { proposal_index: 0, refinement: '', platform_angles: {} }, actor);
  assert.match(objectiveText(adapter, 1), /Cinquante familles/);
  assert.equal(titled.objective_id, objective.id, 'the week now points at the objective its titles used');

  // A later edit of the objective is what a day regenerate (after validation) reads.
  await validateWeek(titled.id, actor);
  await prisma.contentObjective.update({ where: { id: objective.id }, data: { statement: 'Soixante familles' } });
  const again = fake([{ json: titlesFor(plan) }]);
  await regenerateSlot(titled.slots[4]!.id, actor);
  assert.match(objectiveText(again, 0), /Soixante familles/);

  // The objective is removed: the next week-level run reads none and the week follows.
  await prisma.contentObjective.delete({ where: { id: objective.id } });
  const third = fake([{ json: titlesFor(plan) }]);
  await regenerateSlot(titled.slots[5]!.id, actor);
  assert.match(objectiveText(third, 0), /no objective is set/);
  assert.equal((await getWeek(titled.id)).objective_id, null);
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
  const titled = await titledWeek();
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

// ── "Régénérer les propositions": start a week over before validation ──

const fresh = {
  proposals: [0, 1, 2].map((i) => ({ title: `Nouvelle direction ${i}`, rationale: 'r', evidence: ['e'], sample_angles: ['a'] })),
};

/** A week planned without an objective, at `status`, with its direction and (from titles_ready) its day lines. */
async function plannedWeek(startsOn: string, status: string) {
  const week = await createContentWeek(prisma, {
    startsOn: new Date(startsOn),
    firstDay: new Date(startsOn),
    status,
    proposals,
    ...(status === 'proposals_ready' ? {} : { chosenIndex: 1, refinement: 'Plus concret', platformAngles: { tiktok: 'Le jeu en vrai' } }),
  });
  if (status === 'titles_ready') for (let i = 0; i < 3; i++) await createContentSlot(prisma, week.id, { status: 'proposed' });
  return week;
}

test('regenerateProposals starts the week over from each step before validation, with the current objective', async () => {
  const objective = await prisma.contentObjective.create({ data: { month: '2026-10', type: 'signups', statement: 'Cinquante familles' } });
  const statuses = ['proposals_ready', 'direction_set', 'titles_ready'];
  for (const [i, status] of statuses.entries()) {
    const week = await plannedWeek(`2026-10-${String(5 + 7 * i).padStart(2, '0')}`, status);
    assert.equal(week.objectiveId, null);
    const adapter = fake([{ json: fresh }]);

    const out = await regenerateProposals(week.id, actor);
    assert.equal(out.status, 'proposals_ready', status);
    assert.deepEqual(out.proposals?.map((p) => p.title), fresh.proposals.map((p) => p.title));
    assert.equal(out.chosen_index, null);
    assert.equal(out.refinement, null);
    assert.deepEqual(out.platform_angles, {});
    assert.deepEqual(out.slots, []);
    assert.equal(await prisma.contentSlot.count({ where: { weekId: week.id } }), 0);
    assert.equal(out.objective_id, objective.id, 'the week now points at the objective its proposals used');
    assert.equal(out.month_objective_set, true);
    // One paid Strategist run, reading the objective set after the week was planned.
    assert.equal(adapter.calls.length, 1);
    assert.equal(adapter.calls[0]!.req.task, 'content_strategy');
    assert.match(objectiveText(adapter, 0), /Cinquante familles/);

    const [audit] = await prisma.auditLog.findMany({ where: { kind: 'content.week.repropose', targetId: week.id } });
    assert.ok(audit, status);
    assert.equal(audit.actorId, actor.id);
    assert.equal(audit.actorRole, actor.role);
    assert.deepEqual(audit.diff, { from: status, objective_id: objective.id, slots_removed: status === 'titles_ready' ? 3 : 0 });
  }
  assert.equal(reported.length, 0);
});

test('regenerateProposals without an objective re-links none and says the month has none', async () => {
  const week = await plannedWeek('2026-10-26', 'titles_ready');
  fake([{ json: fresh }]);
  const out = await regenerateProposals(week.id, actor);
  assert.equal(out.objective_id, null);
  assert.equal(out.month_objective_set, false);
});

test('getWeek says whether the week month has an objective now, whatever the week points at', async () => {
  const week = await plannedWeek('2026-10-26', 'proposals_ready');
  assert.equal((await getWeek(week.id)).month_objective_set, false);
  await prisma.contentObjective.create({ data: { month: '2026-11', type: 'signups', statement: 'Novembre' } });
  assert.equal((await getWeek(week.id)).month_objective_set, false, 'the week of Mon 26 Oct belongs to October');
  await prisma.contentObjective.create({ data: { month: '2026-10', type: 'signups', statement: 'Octobre' } });
  const dto = await getWeek(week.id);
  assert.equal(dto.month_objective_set, true);
  assert.equal(dto.objective_id, null, 'its proposals were still made without one');
});

test('regenerateProposals refuses a proposing, validated or skipped week (409), paying nothing', async () => {
  const adapter = fake([]);
  for (const status of ['proposing', 'validated', 'skipped']) {
    const week = await createContentWeek(prisma, { status, proposals });
    await assert.rejects(regenerateProposals(week.id, actor), isHttp(409, 'invalid_transition'), status);
    assert.equal((await prisma.contentWeek.findUniqueOrThrow({ where: { id: week.id } })).status, status);
  }
  await assert.rejects(regenerateProposals(randomUUID(), actor), isHttp(404, 'week_not_found'));
  assert.equal(adapter.calls.length, 0);
  assert.equal((await audits('content.week.repropose')).length, 0);
});

test('regenerateProposals refuses while a strategist run on the week is live, changing nothing', async () => {
  const week = await plannedWeek('2026-10-26', 'titles_ready');
  await strategistRun(week.id, 'week_titles', 3);
  const adapter = fake([]);
  await assert.rejects(regenerateProposals(week.id, actor), isHttp(409, 'generation_in_progress'));
  const row = await prisma.contentWeek.findUniqueOrThrow({ where: { id: week.id }, include: { slots: true } });
  assert.equal(row.status, 'titles_ready');
  assert.equal(row.chosenIndex, 1);
  assert.equal(row.slots.length, 3);
  assert.equal(adapter.calls.length, 0);
  assert.equal((await audits('content.week.repropose')).length, 0);
});

test('regenerateProposals refuses a week whose days already have drafts', async () => {
  const week = await plannedWeek('2026-10-26', 'titles_ready');
  const slot = await prisma.contentSlot.findFirstOrThrow({ where: { weekId: week.id } });
  await createContentDraft(prisma, slot.id, { platform: 'linkedin', status: 'ready' });
  const adapter = fake([]);
  await assert.rejects(regenerateProposals(week.id, actor), (err: unknown) => isHttp(409, 'invalid_transition')(err) && /brouillons/.test((err as HttpError).message));
  const row = await prisma.contentWeek.findUniqueOrThrow({ where: { id: week.id }, include: { slots: true } });
  assert.equal(row.status, 'titles_ready');
  assert.equal(row.slots.length, 3);
  assert.equal(await prisma.contentDraft.count(), 1);
  assert.equal(adapter.calls.length, 0);
});

test('a failed regenerate leaves the week proposing, to be relaunched', async () => {
  const week = await plannedWeek('2026-10-26', 'direction_set');
  fake([{ error: 'refusal' }]);
  await assert.rejects(regenerateProposals(week.id, actor));
  const row = await prisma.contentWeek.findUniqueOrThrow({ where: { id: week.id } });
  assert.equal(row.status, 'proposing');
  assert.equal(row.chosenIndex, null);
  assert.equal(row.proposals, null);
  // "Relancer les propositions" picks it up from there.
  fake([{ json: fresh }]);
  assert.equal((await proposeDirections(week.id, 'user_action', actor)).status, 'proposals_ready');
});
