import '../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createContentDraft, createContentSlot, createContentWeek, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import type { AiTask } from '@gabee/types';
import { setErrorReporterForTests } from '../report-error';
import type { EmailMessage, EmailSendResult } from '../email';
import { FakeAiAdapter, resetAiAdapters, setAiAdapters, type AiAdapter, type FakeAiStep } from '../ai/router';
import { checkBudget, monthSpendUsd } from './budget';
import { runTick, type TickSummary } from './jobs';

const prisma = createTestClient();
let reported: Array<{ err: unknown; scope: string }> = [];
let sent: EmailMessage[] = [];

const send = async (m: EmailMessage): Promise<EmailSendResult> => {
  sent.push(m);
  return { ok: true, providerId: `id-${sent.length}` };
};

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  await prisma.studioSettings.update({ where: { id: 'default' }, data: { recipients: ['owner@x.test'] } });
  reported = [];
  sent = [];
  setErrorReporterForTests((err, hint) => reported.push({ err, scope: hint.tags.scope }));
  mock.method(console, 'error', () => {});
  mock.method(console, 'info', () => {});
});
afterEach(() => {
  resetAiAdapters();
  setErrorReporterForTests(null);
  mock.restoreAll();
});
after(async () => prisma.$disconnect());

/** Studio-local Douala wall time (UTC+1, no DST) → instant. */
const at = (local: string) => new Date(Date.parse(`${local}:00Z`) - 3_600_000);
const tick = (local: string) => runTick(at(local), { send });
const statusOf = (s: TickSummary, jobKey: string) => s.ran.find((r) => r.jobKey === jobKey)?.status;
const run = (jobKey: string, periodKey: string) => prisma.jobRun.findUniqueOrThrow({ where: { jobKey_periodKey: { jobKey, periodKey } } });
const notifications = (kind: string) => prisma.studioNotification.findMany({ where: { kind }, orderBy: { createdAt: 'asc' } });

// ── AI scripts ──

const proposals = {
  proposals: [0, 1, 2].map((i) => ({ title: `Direction ${i}`, rationale: 'r', evidence: ['e'], sample_angles: ['a'] })),
};
const linkedinPost = { body: 'Votre enfant compte en jouant.', hashtags: ['#Gabee', '#Parents', '#Maths'], link_target: 'landing' as const };
const tiktokPlan = {
  caption: 'Une minute de calcul. Lien en bio !',
  hashtags: ['#Gabee', '#Parents', '#Maths'],
  on_screen_text: ['3 + 4 ?'],
  mode: 'filming_plan',
  filming_plan: { hook: "L'écran du jeu", shots: ['Écran du module Nombres'], duration_s: 20 },
};
const art = { media_asset_id: null, visual_brief: 'Un enfant devant la tablette' };
const report = { headline: 'Semaine calme, 12 visites.', highlights: ['LinkedIn amène les inscriptions'], watch_outs: [] };

/** One scripted FakeAiAdapter per task, so runs get the right reply whatever their order. */
class ByTaskAdapter implements AiAdapter {
  readonly provider = 'anthropic';
  constructor(readonly byTask: Partial<Record<AiTask, FakeAiAdapter>>) {}
  isAvailable() {
    return true;
  }
  call(...args: Parameters<AiAdapter['call']>) {
    const fake = this.byTask[args[2].task];
    if (!fake) throw new Error(`no script for ${args[2].task}`);
    return fake.call(...args);
  }
}

function byTask(scripts: Partial<Record<AiTask, FakeAiStep[]>>): ByTaskAdapter {
  const adapter = new ByTaskAdapter(Object.fromEntries(Object.entries(scripts).map(([k, s]) => [k, new FakeAiAdapter(s!)])));
  setAiAdapters([adapter]);
  return adapter;
}
const callsOf = (a: ByTaskAdapter, task: AiTask) => a.byTask[task]?.calls.length ?? 0;
const draftScripts = () => ({ post_linkedin: [{ json: linkedinPost }], post_tiktok: [{ json: tiktokPlan }], art_direction: [{ json: art }, { json: art }] });

// ── Fixtures (week of Monday 2026-10-26; 2026-10-25 is a Sunday) ──

async function week(status: string, startsOn = '2026-10-26') {
  return createContentWeek(prisma, {
    startsOn: new Date(startsOn),
    firstDay: new Date(startsOn),
    status,
    proposals,
    chosenIndex: 0,
    refinement: '',
    ...(status === 'validated' ? { validatedAt: new Date() } : {}),
  });
}
const slot = (weekId: string, date: string, status = 'validated') => createContentSlot(prisma, weekId, { date: new Date(date), topic: `Sujet ${date}`, status });

// ── Tests ──

test('runTick runs each job once per period across two ticks', async () => {
  const w = await week('validated');
  const s = await slot(w.id, '2026-10-28');
  const adapter = byTask(draftScripts());

  const first = await tick('2026-10-28T05:10');
  assert.equal(statusOf(first, 'day.generate'), 'succeeded');
  assert.equal(statusOf(first, 'day.notify'), 'succeeded');
  assert.equal(statusOf(first, 'budget.check'), 'succeeded');
  assert.equal(first.skipped, 0);
  const drafts = await prisma.contentDraft.findMany({ where: { slotId: s.id } });
  assert.deepEqual(drafts.map((d) => `${d.platform}:${d.status}`).sort(), ['linkedin:ready', 'tiktok:ready']);
  assert.equal((await notifications('day.drafts')).length, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.subject, /Brouillons/);

  const second = await tick('2026-10-28T05:20');
  assert.deepEqual(second.ran, []);
  assert.equal(second.skipped, 3, 'generate, notify and the same hour budget check are already done');
  assert.equal(callsOf(adapter, 'post_linkedin'), 1);
  assert.equal(sent.length, 1);

  const gen = await run('day.generate', 'day:2026-10-28');
  assert.equal(gen.status, 'succeeded');
  assert.equal(gen.attempts, 0);
  assert.ok(gen.finishedAt);
  assert.deepEqual(reported, []);
});

test('two overlapping ticks run each job once', async () => {
  const w = await week('validated');
  await slot(w.id, '2026-10-28');
  const adapter = byTask(draftScripts());
  const [a, b] = await Promise.all([tick('2026-10-28T05:10'), tick('2026-10-28T05:10')]);
  // The tick that lost day.generate may find day.notify before the drafts exist: it waits, never sends.
  const done = [...a.ran, ...b.ran].filter((r) => r.status !== 'waiting');
  assert.deepEqual(done.map((r) => `${r.jobKey}:${r.status}`).sort(), ['budget.check:succeeded', 'day.generate:succeeded', 'day.notify:succeeded']);
  assert.equal(callsOf(adapter, 'post_linkedin'), 1);
  assert.equal(sent.length, 1);
});

test('late validation: day.generate waits, then drafts and the notification follow', async () => {
  const w = await week('titles_ready');
  await slot(w.id, '2026-10-26', 'proposed');
  const adapter = byTask(draftScripts());

  const before = await tick('2026-10-26T06:00');
  assert.equal(statusOf(before, 'day.generate'), 'waiting');
  assert.equal(statusOf(before, 'day.notify'), 'waiting');
  const waiting = await run('day.generate', 'day:2026-10-26');
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.attempts, 0, 'waiting is not an attempt');
  assert.equal(callsOf(adapter, 'post_linkedin'), 0);
  assert.equal(sent.length, 0);

  // Still waiting on the next tick: re-run, not consumed.
  assert.equal(statusOf(await tick('2026-10-26T06:10'), 'day.generate'), 'waiting');

  // The owner validates the week at 06:15.
  await prisma.contentWeek.update({ where: { id: w.id }, data: { status: 'validated', validatedAt: new Date() } });
  await prisma.contentSlot.updateMany({ where: { weekId: w.id }, data: { status: 'validated' } });

  const after = await tick('2026-10-26T06:20');
  assert.equal(statusOf(after, 'day.generate'), 'succeeded');
  assert.equal(statusOf(after, 'day.notify'), 'succeeded');
  assert.equal(callsOf(adapter, 'post_linkedin'), 1);
  assert.equal((await notifications('day.drafts')).length, 1);
  assert.equal((await run('day.generate', 'day:2026-10-26')).attempts, 0);
});

test('day.generate never regenerates a failed draft: the owner retries it', async () => {
  const w = await week('validated');
  const s = await slot(w.id, '2026-10-28', 'drafted');
  await createContentDraft(prisma, s.id, { platform: 'linkedin', status: 'failed', error: "L'IA a refusé de rédiger ce post." });
  await createContentDraft(prisma, s.id, { platform: 'tiktok', status: 'ready' });
  const adapter = byTask(draftScripts());

  const t = await tick('2026-10-28T04:10');
  assert.equal(statusOf(t, 'day.generate'), 'succeeded');
  assert.equal(callsOf(adapter, 'post_linkedin'), 0, 'no paid retry');
  assert.equal(await prisma.agentRun.count(), 0);
  const li = await prisma.contentDraft.findFirstOrThrow({ where: { slotId: s.id, platform: 'linkedin' } });
  assert.equal(li.status, 'failed');
  assert.equal((await run('day.generate', 'day:2026-10-28')).attempts, 0);
});

test('day.generate writes only the missing draft of a day', async () => {
  const w = await week('validated');
  const s = await slot(w.id, '2026-10-28', 'drafted');
  await createContentDraft(prisma, s.id, { platform: 'linkedin', status: 'stale' });
  const adapter = byTask(draftScripts());
  assert.equal(statusOf(await tick('2026-10-28T04:10'), 'day.generate'), 'succeeded');
  assert.equal(callsOf(adapter, 'post_linkedin'), 0, 'a stale draft is the owner’s call');
  assert.equal(callsOf(adapter, 'post_tiktok'), 1);
  const drafts = await prisma.contentDraft.findMany({ where: { slotId: s.id } });
  assert.deepEqual(drafts.map((d) => `${d.platform}:${d.status}`).sort(), ['linkedin:stale', 'tiktok:ready']);
});

test('day jobs on a day without a slot, or a skipped one, succeed without AI or email', async () => {
  const w = await week('validated');
  await slot(w.id, '2026-10-27', 'skipped');
  byTask({});
  const s1 = await tick('2026-10-27T09:00');
  assert.equal(statusOf(s1, 'day.generate'), 'succeeded');
  assert.equal(statusOf(s1, 'day.notify'), 'succeeded');
  assert.equal(statusOf(s1, 'day.remind'), 'succeeded');
  const s2 = await tick('2026-10-29T05:00'); // no slot planned that day
  assert.equal(statusOf(s2, 'day.generate'), 'succeeded');
  assert.equal(statusOf(s2, 'day.notify'), 'succeeded');
  assert.equal(await prisma.agentRun.count(), 0);
  assert.equal(sent.length, 0);
});

test('Sunday: propose, email with the report, remind until validated', async () => {
  const adapter = byTask({ content_strategy: [{ json: proposals }], report_narrative: [{ json: report }] });

  const morning = await tick('2026-10-25T06:05');
  assert.equal(statusOf(morning, 'week.propose'), 'succeeded');
  const w = await prisma.contentWeek.findUniqueOrThrow({ where: { startsOn: new Date('2026-10-26') } });
  assert.equal(w.status, 'proposals_ready');
  assert.equal(sent.length, 0, 'the Sunday email waits for 07:00');

  const seven = await tick('2026-10-25T07:05');
  assert.equal(statusOf(seven, 'week.email'), 'succeeded');
  assert.equal(statusOf(seven, 'week.propose'), undefined, 'already done');
  const analyst = await prisma.agentRun.findFirstOrThrow({ where: { agentKey: 'analyst' } });
  assert.equal(analyst.subjectId, '2026-10-19', 'the report covers the past week');
  assert.equal(analyst.origin, 'scheduled_job');
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.text, /Semaine calme, 12 visites\./);
  assert.match(sent[0]!.text, /Direction 0/);
  assert.match(sent[0]!.text, /\/admin\/communication\/semaine/);

  const afternoon = await tick('2026-10-25T15:05');
  assert.equal(statusOf(afternoon, 'week.remind'), 'succeeded');
  assert.equal((await notifications('week.remind')).map((n) => n.periodKey).join(), 'week:2026-10-26@15');

  await prisma.contentWeek.update({ where: { id: w.id }, data: { status: 'validated', validatedAt: new Date() } });
  const evening = await tick('2026-10-25T20:05');
  assert.equal(statusOf(evening, 'week.remind'), 'succeeded');
  assert.equal((await notifications('week.remind')).length, 1, 'no reminder once the week is validated');
  assert.equal(callsOf(adapter, 'content_strategy'), 1);
  assert.deepEqual(reported, []);
});

test('week.email waits for the proposals, and goes out without the report when the analyst fails', async () => {
  const w = await week('proposing');
  byTask({ content_strategy: Array.from({ length: 20 }, () => ({ error: 'outage' as const })), report_narrative: [{ error: 'refusal' }] });

  const first = await tick('2026-10-25T07:00');
  assert.equal(statusOf(first, 'week.propose'), 'failed', 'a week stuck proposing is retried');
  assert.equal(statusOf(first, 'week.email'), 'waiting');
  assert.equal((await run('week.email', 'week:2026-10-26')).attempts, 0);
  assert.equal(sent.length, 0);

  await prisma.contentWeek.update({ where: { id: w.id }, data: { status: 'proposals_ready' } });
  const s = await tick('2026-10-25T07:10');
  assert.equal(statusOf(s, 'week.email'), 'succeeded');
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.text, /Le bilan n'a pas pu être rédigé cette fois\./);
  assert.equal(reported.filter((r) => r.scope === 'content.jobs').length, 1, 'the refusal is reported once');
});

test('week.propose skips a week that already exists', async () => {
  await week('titles_ready');
  const adapter = byTask({});
  assert.equal(statusOf(await tick('2026-10-25T06:05'), 'week.propose'), 'succeeded');
  assert.equal(adapter.byTask.content_strategy, undefined);
});

test('failed job backs off, then is abandoned and alerted at the 4th attempt', async () => {
  const adapter = byTask({ content_strategy: Array.from({ length: 60 }, () => ({ error: 'outage' as const })) });

  const t1 = await tick('2026-10-25T06:05');
  assert.equal(statusOf(t1, 'week.propose'), 'failed');
  let row = await run('week.propose', 'week:2026-10-26');
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 1);
  assert.ok(row.error);
  assert.equal(row.nextAttemptAt?.toISOString(), at('2026-10-25T06:15').toISOString(), '2^1 × 5 min');

  // Backing off: not retried before nextAttemptAt.
  assert.equal(statusOf(await tick('2026-10-25T06:10'), 'week.propose'), undefined);

  assert.equal(statusOf(await tick('2026-10-25T06:15'), 'week.propose'), 'failed');
  row = await run('week.propose', 'week:2026-10-26');
  assert.equal(row.attempts, 2);
  assert.equal(row.nextAttemptAt?.toISOString(), at('2026-10-25T06:35').toISOString(), '2^2 × 5 min');

  await tick('2026-10-25T06:35');
  row = await run('week.propose', 'week:2026-10-26');
  assert.equal(row.attempts, 3);
  assert.equal(row.nextAttemptAt?.toISOString(), at('2026-10-25T07:15').toISOString(), '2^3 × 5 min');
  assert.equal((await notifications('job.failed')).length, 0, 'no alert before the 4th attempt');

  const t4 = await tick('2026-10-25T07:15');
  assert.equal(statusOf(t4, 'week.propose'), 'abandoned');
  assert.equal(statusOf(t4, 'week.email'), 'waiting', 'no proposals yet');
  row = await run('week.propose', 'week:2026-10-26');
  assert.equal(row.status, 'abandoned', 'Ruling 12: at most 4 attempts');
  assert.equal(row.attempts, 4);
  assert.equal(row.nextAttemptAt, null);
  assert.ok(row.error);
  const alerts = await notifications('job.failed');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]!.periodKey, 'week.propose|week:2026-10-26');
  assert.match(sent.find((m) => /a échoué/.test(m.subject))!.subject, /week\.propose/);
  assert.equal(reported.filter((r) => r.scope === 'content.jobs').length, 0, 'an unavailable AI was already reported by the router');

  // Terminal: no 5th attempt, no further paid call.
  const calls = callsOf(adapter, 'content_strategy');
  for (const local of ['2026-10-25T08:15', '2026-10-25T10:00', '2026-10-25T23:50']) {
    assert.equal(statusOf(await tick(local), 'week.propose'), undefined, local);
  }
  assert.equal((await run('week.propose', 'week:2026-10-26')).attempts, 4);
  assert.equal(callsOf(adapter, 'content_strategy'), calls);
  assert.equal((await notifications('job.failed')).length, 1, 'alerted once');
  assert.equal(sent.filter((m) => /a échoué/.test(m.subject)).length, 1);
});

test('a job failing on its own error is reported once, at the 4th attempt', async () => {
  // No published editorial line: the Strategist cannot run.
  await prisma.editorialLineVersion.updateMany({ data: { publishedAt: null } });
  byTask({});
  for (const local of ['2026-10-25T06:00', '2026-10-25T06:10', '2026-10-25T06:30']) {
    assert.equal(statusOf(await tick(local), 'week.propose'), 'failed', local);
  }
  assert.equal(reported.filter((r) => r.scope === 'content.jobs').length, 0, 'recorded on the run row until exhausted');
  assert.match((await run('week.propose', 'week:2026-10-26')).error ?? '', /editorial line/);
  assert.equal(statusOf(await tick('2026-10-25T07:10'), 'week.propose'), 'abandoned');
  const jobReports = reported.filter((r) => r.scope === 'content.jobs');
  assert.equal(jobReports.length, 1);
  assert.match(String(jobReports[0]!.err), /editorial line/);
  assert.equal((await notifications('job.failed')).length, 1);
});

test('a job failing on an error reported upstream is not reported again', async () => {
  await week('proposals_ready');
  byTask({ report_narrative: Array.from({ length: 4 }, () => ({ json: report })) });
  // A broken sender: every Sunday email fails (recorded + reported by notify).
  const broken = async (): Promise<EmailSendResult> => ({ ok: false, error: 'mailer down' });
  for (const local of ['2026-10-25T07:00', '2026-10-25T07:10', '2026-10-25T07:30']) {
    assert.equal(statusOf(await runTick(at(local), { send: broken }), 'week.email'), 'failed', local);
  }
  assert.equal(statusOf(await runTick(at('2026-10-25T08:10'), { send: broken }), 'week.email'), 'abandoned');
  assert.equal((await run('week.email', 'week:2026-10-26')).attempts, 4);
  // Every failed send is reported by notifyOnce; the job layer adds nothing for an
  // error already reported upstream.
  assert.equal(reported.filter((r) => r.scope === 'content.jobs').length, 0);
  assert.ok(reported.filter((r) => r.scope === 'content.notify').length >= 4);
});

test('a running job abandoned for 15 minutes is taken over', async () => {
  await prisma.jobRun.create({ data: { jobKey: 'budget.check', periodKey: 'hour:2026-10-28T10', status: 'running', startedAt: at('2026-10-28T10:00') } });
  assert.equal(statusOf(await tick('2026-10-28T10:10'), 'budget.check'), undefined, 'still running');
  assert.equal(statusOf(await tick('2026-10-28T10:20'), 'budget.check'), 'succeeded');
});

test('day.remind only when drafts wait for approval or publication', async () => {
  const w = await week('validated');
  const s = await slot(w.id, '2026-10-28', 'drafted');
  const li = await createContentDraft(prisma, s.id, { platform: 'linkedin', status: 'ready' });
  const tt = await createContentDraft(prisma, s.id, { platform: 'tiktok', status: 'approved' });
  byTask({});

  const morning = await tick('2026-10-28T09:10');
  assert.equal(statusOf(morning, 'day.generate'), 'succeeded', 'drafts already exist');
  assert.equal(statusOf(morning, 'day.remind'), 'succeeded');
  const reminders = await notifications('day.remind');
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0]!.periodKey, 'day:2026-10-28@09');
  assert.match(sent.find((m) => /Il reste/.test(m.subject))!.text, /1 brouillon à relire/);

  await prisma.contentDraft.updateMany({ where: { id: { in: [li.id, tt.id] } }, data: { status: 'published' } });
  const afternoon = await tick('2026-10-28T13:05');
  assert.equal(statusOf(afternoon, 'day.remind'), 'succeeded');
  assert.equal((await notifications('day.remind')).length, 1, 'nothing pending at 13:00: no reminder');
});

test('budget alert sent once per month at 80%', async () => {
  const usage = (costUsd: number, task: string | null, createdAt: Date) =>
    prisma.aiUsage.create({ data: { provider: 'anthropic', model: 'claude-opus-5-5', purpose: 'test', costUsd, task, createdAt } });
  // Default budget 50 $, ratio 0.8 → alert at 40 $.
  await usage(500, null, at('2026-10-10T10:00')); // question authoring: not in the studio budget
  await usage(30, 'post_linkedin', at('2026-10-10T10:00'));
  await usage(20, 'post_linkedin', at('2026-09-30T10:00')); // last month
  assert.equal(await monthSpendUsd('2026-10'), 30);

  assert.deepEqual(await checkBudget(at('2026-10-28T10:00'), send), { month: '2026-10', spentUsd: 30, budgetUsd: 50, alerted: false });
  assert.equal(sent.length, 0);

  await usage(10.5, 'content_strategy', at('2026-10-28T09:30'));
  const s = await tick('2026-10-28T10:05');
  assert.equal(statusOf(s, 'budget.check'), 'succeeded');
  assert.equal((await notifications('budget.alert')).length, 1);
  assert.match(sent[0]!.subject, /Budget IA de 2026-10 à 81 %/);
  assert.equal((await prisma.studioSettings.findUniqueOrThrow({ where: { id: 'default' } })).budgetAlertSentFor, '2026-10');

  await usage(5, 'content_strategy', at('2026-10-28T10:30'));
  await tick('2026-10-28T11:05');
  assert.equal((await notifications('budget.alert')).length, 1, 'once per month');
  assert.equal(sent.length, 1);
});
