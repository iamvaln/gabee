import '../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createContentDraft,
  createContentSlot,
  createContentWeek,
  createMediaAsset,
  createTestClient,
  resetDb,
  seedContentStudio,
} from '@gabee/db/testing';
import { setErrorReporterForTests } from '../report-error';
import { AiInvalidOutputError, AiRefusedError, AiUnavailableError, resetAiAdapters, setAiAdapters } from '../ai/router';
import type { AiInputBlock } from '../ai/router';
import { FakeAiAdapter, type FakeAiStep } from '../ai/router/fake-adapter';
import { runAgent } from './agents';

const prisma = createTestClient();
const OPUS = 'claude-opus-5-5';
let reported: Array<{ err: unknown; scope: string }> = [];

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  reported = [];
  setErrorReporterForTests((err, hint) => reported.push({ err, scope: hint.tags.scope }));
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

const labelsOf = (blocks: AiInputBlock[]) => blocks.flatMap((b) => (b.kind === 'text' ? [b.label] : []));

const proposals = {
  proposals: [0, 1, 2].map((i) => ({ title: `Direction ${i}`, rationale: 'r', evidence: ['e'], sample_angles: ['a'] })),
};
const linkedinPost = { body: 'Votre enfant compte en jouant.', hashtags: ['#Gabee', '#Parents', '#Maths'], link_target: 'signup' as const };
const tiktokPlan = {
  caption: 'Une minute de calcul. Lien en bio !',
  hashtags: ['#Gabee', '#Parents', '#Maths'],
  on_screen_text: ['3 + 4 ?'],
  mode: 'filming_plan',
  filming_plan: { hook: "L'écran du jeu", shots: ['Écran du module Nombres'], duration_s: 20 },
};

async function draftFixture(platform: 'linkedin' | 'tiktok' = 'linkedin', pillar: 'gabee' | 'light' | 'value' = 'gabee') {
  const week = await createContentWeek(prisma, {
    startsOn: new Date('2026-10-26'),
    firstDay: new Date('2026-10-26'),
    status: 'validated',
    proposals: proposals,
    chosenIndex: 1,
    refinement: 'Plus concret, moins de théorie',
    platformAngles: { tiktok: 'Montrer le jeu en vrai' },
  });
  const slot = await createContentSlot(prisma, week.id, {
    date: new Date('2026-10-28'),
    topic: 'Compter les courses',
    angle: 'Les maths au marché',
    format: 'gameplay_video',
    pillar,
    platforms: [
      { platform: 'linkedin', language: 'en' },
      { platform: 'tiktok', language: 'fr' },
    ],
    sources: [{ title: 'Article', url: 'https://news.example/article' }],
  });
  const draft = await createContentDraft(prisma, slot.id, { platform, language: platform === 'linkedin' ? 'en' : 'fr', status: 'generating' });
  return { week, slot, draft };
}

test('runAgent journals model, tokens, cost and latency', async () => {
  const week = await createContentWeek(prisma, { startsOn: new Date('2026-10-26'), firstDay: new Date('2026-10-26') });
  const adapter = fake([{ json: proposals, inputTokens: 1000, outputTokens: 500 }]);

  const out = await runAgent('strategist', { kind: 'week_proposals', id: week.id }, 'scheduled_job');
  assert.deepEqual(out, proposals);

  // The proposals run: content_strategy, web search on, published instructions as system.
  const req = adapter.calls[0]!.req;
  assert.equal(req.task, 'content_strategy');
  assert.deepEqual(req.webSearch, { maxUses: 5 });
  const agent = await prisma.agent.findUniqueOrThrow({ where: { key: 'strategist' }, include: { publishedVersion: true } });
  assert.equal(req.system, agent.publishedVersion!.instructions);
  assert.deepEqual(labelsOf(req.blocks), ['task', 'objective', 'editorial_line', 'platform_profiles', 'recent_weeks', 'audience', 'metrics']);

  const run = await prisma.agentRun.findFirstOrThrow({ include: { aiUsage: true } });
  assert.equal(run.agentKey, 'strategist');
  assert.equal(run.agentVersionId, agent.publishedVersionId);
  assert.equal(run.origin, 'scheduled_job');
  assert.equal(run.subjectKind, 'week_proposals');
  assert.equal(run.subjectId, week.id);
  assert.equal(run.status, 'succeeded');
  assert.deepEqual(run.output, proposals);
  assert.match(run.inputHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(labelsOf((run.input as { blocks: AiInputBlock[] }).blocks), labelsOf(req.blocks));
  assert.equal(typeof run.latencyMs, 'number');
  assert.ok(run.finishedAt);
  assert.equal(run.errorCode, null);
  assert.equal(req.agentRunId, run.id);

  // Model, tokens and cost live on the linked ai_usage row (seeded opus: $4 / $20 per MTok).
  assert.equal(run.aiUsage.length, 1);
  const usage = run.aiUsage[0]!;
  assert.equal(usage.model, OPUS);
  assert.equal(usage.inputTokens, 1000);
  assert.equal(usage.outputTokens, 500);
  assert.equal(usage.costUsd, 0.014);
  assert.equal(usage.task, 'content_strategy');
  assert.equal(usage.status, 'succeeded');
  assert.equal(reported.length, 0);
});

test('runAgent retries once on invalid output then records invalid_output', async () => {
  const { draft } = await draftFixture('linkedin');
  const tooLong = { ...linkedinPost, body: 'a'.repeat(3001) };
  const adapter = fake([{ json: tooLong }, { json: { body: 42 } }]);

  await assert.rejects(runAgent('writer_linkedin', { kind: 'draft', id: draft.id }, 'user_action'), AiInvalidOutputError);
  assert.equal(adapter.calls.length, 2);
  // The retry tells the model what was wrong with its first answer.
  const retry = adapter.calls[1]!.req.blocks.find((b) => b.kind === 'text' && b.label === 'retry_feedback');
  assert.ok(retry && retry.kind === 'text' && retry.trusted && /3001/.test(retry.text));

  const run = await prisma.agentRun.findFirstOrThrow({ include: { aiUsage: true } });
  assert.equal(run.status, 'invalid_output');
  assert.equal(run.errorCode, 'schema_mismatch');
  assert.ok(run.errorMessage);
  assert.equal(run.output, null);
  assert.ok(run.finishedAt);
  assert.equal(run.aiUsage.length, 2);
  // Invalid output is recorded on the run and rethrown — never re-reported (Ruling 7).
  assert.equal(reported.length, 0);
  assert.equal(await prisma.agentRun.count(), 1);
});

test('runAgent rejects platform-rule violations twice as post_rules', async () => {
  const { draft } = await draftFixture('linkedin');
  const withUrl = { ...linkedinPost, body: 'Inscrivez-vous : https://parents.gabee.app/signup' };
  fake([{ json: withUrl }, { json: withUrl }]);
  await assert.rejects(runAgent('writer_linkedin', { kind: 'draft', id: draft.id }, 'user_action'), AiInvalidOutputError);
  const run = await prisma.agentRun.findFirstOrThrow();
  assert.equal(run.status, 'invalid_output');
  assert.equal(run.errorCode, 'post_rules');
  assert.match(run.errorMessage ?? '', /URL/);
  // Every attempt was billed and stays visible on ai_usage, as the invalid output it was.
  const usage = await prisma.aiUsage.findMany({ where: { agentRunId: run.id } });
  assert.equal(usage.length, 2);
  assert.deepEqual(
    usage.map((u) => [u.status, u.errorCode]),
    [
      ['invalid_output', 'post_rules'],
      ['invalid_output', 'post_rules'],
    ],
  );
  assert.ok(usage.every((u) => (u.costUsd ?? 0) > 0), 'the cost is kept');
});

test('runAgent succeeds on the retry after one invalid output', async () => {
  const { draft } = await draftFixture('linkedin');
  const adapter = fake([{ json: { ...linkedinPost, hashtags: ['#un'] } }, { json: linkedinPost }]);
  const out = await runAgent('writer_linkedin', { kind: 'draft', id: draft.id }, 'scheduled_job');
  assert.deepEqual(out, linkedinPost);
  assert.equal(adapter.calls.length, 2);
  const run = await prisma.agentRun.findFirstOrThrow();
  assert.equal(run.status, 'succeeded');
  // The rejected first answer is metered as invalid output, the accepted retry as succeeded.
  const usage = await prisma.aiUsage.findMany({ where: { agentRunId: run.id } });
  assert.deepEqual(usage.map((u) => u.status).sort(), ['invalid_output', 'succeeded']);

  const req = adapter.calls[0]!.req;
  assert.equal(req.task, 'post_linkedin');
  assert.equal(req.webSearch, undefined);
  assert.deepEqual(labelsOf(req.blocks), ['editorial_line', 'platform_profile', 'objective', 'week_direction', 'slot', 'sources', 'past_publications', 'owner_edits']);
  const text = (label: string) => {
    const b = req.blocks.find((x) => x.kind === 'text' && x.label === label);
    return b && b.kind === 'text' ? b : assert.fail(`missing ${label}`);
  };
  assert.match(text('week_direction').text, /Direction 1/);
  assert.match(text('week_direction').text, /Plus concret/);
  assert.doesNotMatch(text('week_direction').text, /Montrer le jeu/); // TikTok-only angle
  assert.match(text('slot').text, /"language": "en"/);
  assert.match(text('slot').text, /"pillar": "gabee"/, 'the writer knows the day is about Gabee');
  assert.equal(text('sources').trusted, false);
});

test('a LinkedIn post asking to sign up on a light day is invalid: retried with feedback', async () => {
  const { draft } = await draftFixture('linkedin', 'light');
  const adapter = fake([{ json: linkedinPost }, { json: { ...linkedinPost, link_target: 'landing' } }]);
  const out = await runAgent('writer_linkedin', { kind: 'draft', id: draft.id }, 'scheduled_job');
  assert.equal(out.link_target, 'landing');
  const slot = adapter.calls[0]!.req.blocks.find((b) => b.kind === 'text' && b.label === 'slot');
  assert.ok(slot && slot.kind === 'text' && /"pillar": "light"/.test(slot.text));
  const feedback = adapter.calls[1]!.req.blocks.find((b) => b.kind === 'text' && b.label === 'retry_feedback');
  assert.ok(feedback && feedback.kind === 'text' && /link_target must be "landing" on a "light" day/.test(feedback.text));
});

test('writers read the month objective as it is now, not the one the week was created with', async () => {
  // The week was planned before any objective existed for October.
  const { week, draft } = await draftFixture('linkedin');
  assert.equal(week.objectiveId, null);
  await prisma.contentObjective.create({ data: { month: '2026-10', type: 'signups', statement: 'Cinquante familles inscrites', targets: { signups: 50 } } });
  // Another month's objective never leaks in.
  await prisma.contentObjective.create({ data: { month: '2026-11', type: 'awareness', statement: 'Objectif de novembre' } });

  const adapter = fake([{ json: linkedinPost }]);
  await runAgent('writer_linkedin', { kind: 'draft', id: draft.id }, 'scheduled_job');
  const objective = adapter.calls[0]!.req.blocks.find((b) => b.kind === 'text' && b.label === 'objective');
  assert.ok(objective && objective.kind === 'text' && objective.trusted);
  assert.match(objective.text, /Cinquante familles inscrites/);
  assert.doesNotMatch(objective.text, /novembre/);

  // No objective for the week's month: the block says so.
  await prisma.contentObjective.deleteMany({ where: { month: '2026-10' } });
  await prisma.contentDraft.update({ where: { id: draft.id }, data: { status: 'generating' } });
  const again = fake([{ json: linkedinPost }]);
  await runAgent('writer_linkedin', { kind: 'draft', id: draft.id }, 'scheduled_job');
  const none = again.calls[0]!.req.blocks.find((b) => b.kind === 'text' && b.label === 'objective');
  assert.ok(none && none.kind === 'text');
  assert.match(none.text, /no objective is set/);
});

test('writer memory learns from past publications and owner edits on its platform', async () => {
  const { slot, draft } = await draftFixture('linkedin');
  // A past LinkedIn draft the owner rewrote and published.
  const pastSlot = await createContentSlot(prisma, (await createContentWeek(prisma)).id, { topic: 'Ancien sujet' });
  const past = await createContentDraft(prisma, pastSlot.id, { platform: 'linkedin', status: 'published' });
  const v1 = await prisma.contentDraftVersion.create({
    data: { draftId: past.id, n: 1, source: 'agent', payload: { ...linkedinPost, body: 'Phrase générée.\nFin.' } },
  });
  const v2 = await prisma.contentDraftVersion.create({
    data: { draftId: past.id, n: 2, source: 'owner', payload: { ...linkedinPost, body: 'Phrase du propriétaire.\nFin.' } },
  });
  await prisma.contentDraft.update({ where: { id: past.id }, data: { currentVersionId: v2.id, approvedVersionId: v2.id } });
  await prisma.contentPublication.create({
    data: { draftId: past.id, postUrl: 'https://www.linkedin.com/x', publishedAt: new Date('2026-10-20'), rating: 2, comment: 'Trop long', recordedById: '00000000-0000-4000-8000-000000000001' },
  });
  // A TikTok publication must not leak into the LinkedIn writer's memory.
  const tt = await createContentDraft(prisma, slot.id, { platform: 'tiktok', status: 'published' });
  await prisma.contentPublication.create({
    data: { draftId: tt.id, postUrl: 'https://tiktok.com/x', publishedAt: new Date('2026-10-21'), rating: 5, comment: 'TikTok only', recordedById: '00000000-0000-4000-8000-000000000001' },
  });
  void v1;

  const adapter = fake([{ json: linkedinPost }]);
  await runAgent('writer_linkedin', { kind: 'draft', id: draft.id }, 'scheduled_job');
  const blocks = adapter.calls[0]!.req.blocks;
  const get = (label: string) => {
    const b = blocks.find((x) => x.kind === 'text' && x.label === label);
    return b && b.kind === 'text' ? b.text : assert.fail(`missing ${label}`);
  };
  assert.match(get('past_publications'), /Trop long/);
  assert.match(get('past_publications'), /Phrase du propriétaire/);
  assert.doesNotMatch(get('past_publications'), /TikTok only/);
  assert.match(get('owner_edits'), /-Phrase générée\./);
  assert.match(get('owner_edits'), /\+Phrase du propriétaire\./);
});

test('tiktok writer sees only cleared vertical videos; library_video needs one', async () => {
  const { draft } = await draftFixture('tiktok');
  const good = await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '9:16', cleared: true, fileName: 'jeu-nombres.mp4' });
  await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '9:16', cleared: false, fileName: 'not-cleared.mp4' });
  await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '16:9', cleared: true, fileName: 'landscape.mp4' });
  await createMediaAsset(prisma, { kind: 'image', aspect: '9:16', cleared: true, fileName: 'still.png' });
  await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '9:16', cleared: true, status: 'pending', fileName: 'pending.mp4' });

  const adapter = fake([{ json: { ...tiktokPlan, mode: 'library_video', filming_plan: undefined } }]);
  await runAgent('writer_tiktok', { kind: 'draft', id: draft.id }, 'scheduled_job');
  const req = adapter.calls[0]!.req;
  assert.equal(req.task, 'post_tiktok');
  assert.equal(labelsOf(req.blocks).at(-1), 'media_library');
  const lib = req.blocks.find((b) => b.kind === 'text' && b.label === 'media_library');
  assert.ok(lib && lib.kind === 'text' && !lib.trusted);
  assert.match(lib.text, new RegExp(good.id));
  for (const hidden of ['not-cleared', 'landscape', 'still', 'pending']) assert.doesNotMatch(lib.text, new RegExp(hidden));
  const week = req.blocks.find((b) => b.kind === 'text' && b.label === 'week_direction');
  assert.ok(week && week.kind === 'text' && /Montrer le jeu en vrai/.test(week.text));

  // With no cleared vertical video, library_video is an unusable answer.
  await prisma.mediaAsset.deleteMany();
  fake([{ json: { ...tiktokPlan, mode: 'library_video', filming_plan: undefined } }, { json: { ...tiktokPlan, mode: 'library_video', filming_plan: undefined } }]);
  await assert.rejects(runAgent('writer_tiktok', { kind: 'draft', id: draft.id }, 'scheduled_job'), AiInvalidOutputError);
});

test('art director picks from the cleared library and refuses invented ids', async () => {
  const { draft } = await draftFixture('linkedin');
  const image = await createMediaAsset(prisma, { kind: 'image', aspect: '16:9', cleared: true, fileName: 'hero.png', tags: ['nombres'] });
  await createMediaAsset(prisma, { kind: 'image', aspect: '16:9', cleared: false, fileName: 'secret.png' });
  const version = await prisma.contentDraftVersion.create({ data: { draftId: draft.id, n: 1, source: 'agent', payload: linkedinPost } });
  await prisma.contentDraft.update({ where: { id: draft.id }, data: { currentVersionId: version.id } });

  const invented = { media_asset_id: '99999999-9999-4999-8999-999999999999', visual_brief: 'Une abeille.' };
  const chosen = { media_asset_id: image.id, visual_brief: 'Gabee au marché.' };
  const adapter = fake([{ json: invented }, { json: chosen }]);
  const out = await runAgent('art_director', { kind: 'draft', id: draft.id }, 'scheduled_job');
  assert.deepEqual(out, chosen);
  const req = adapter.calls[0]!.req;
  assert.equal(req.task, 'art_direction');
  assert.deepEqual(labelsOf(req.blocks), ['editorial_line', 'slot', 'platform_profile', 'draft', 'media_library']);
  const lib = req.blocks.find((b) => b.kind === 'text' && b.label === 'media_library');
  assert.ok(lib && lib.kind === 'text' && lib.text.includes('hero.png') && !lib.text.includes('secret.png'));
  const draftBlock = req.blocks.find((b) => b.kind === 'text' && b.label === 'draft');
  assert.ok(draftBlock && draftBlock.kind === 'text' && draftBlock.text.includes('Votre enfant compte'));

  // A post handed in directly wins over the stored version (writer → art director in one pass).
  const adapter2 = fake([{ json: chosen }]);
  await runAgent('art_director', { kind: 'draft', id: draft.id }, 'scheduled_job', undefined, { post: { ...linkedinPost, body: 'Texte tout neuf' } });
  const d2 = adapter2.calls[0]!.req.blocks.find((b) => b.kind === 'text' && b.label === 'draft');
  assert.ok(d2 && d2.kind === 'text' && d2.text.includes('Texte tout neuf'));
});

test('strategist titles run plans exactly the posting days without web search', async () => {
  const week = await createContentWeek(prisma, {
    startsOn: new Date('2026-10-26'),
    firstDay: new Date('2026-10-29'),
    status: 'direction_set',
    proposals,
    chosenIndex: 2,
    refinement: 'Le marché',
  });
  // Thursday (LinkedIn), Friday and Sunday (TikTok): the default cadence from Thursday.
  const plan: Array<[string, 'linkedin' | 'tiktok', 'light' | 'value']> = [
    ['2026-10-29', 'linkedin', 'value'],
    ['2026-10-30', 'tiktok', 'light'],
    ['2026-11-01', 'tiktok', 'value'],
  ];
  const dates = plan.map(([date]) => date);
  const day = ([date, platform, pillar]: (typeof plan)[number]) => ({
    date,
    topic: `Sujet ${date}`,
    angle: 'a',
    format: 'story',
    pillar,
    platforms: [{ platform, language: 'en' }],
    sources: [],
  });
  const adapter = fake([{ json: { days: [day(['2026-10-26', 'tiktok', 'light'])] } }, { json: { days: plan.map(day) } }]);
  const out = await runAgent('strategist', { kind: 'week_titles', id: week.id }, 'user_action', '00000000-0000-4000-8000-000000000001');
  assert.equal('days' in out && out.days.length, 3);
  assert.equal(adapter.calls.length, 2);
  const req = adapter.calls[0]!.req;
  assert.equal(req.task, 'content_titles');
  assert.equal(req.webSearch, undefined);
  assert.equal(req.actorId, '00000000-0000-4000-8000-000000000001');
  assert.deepEqual(labelsOf(req.blocks).slice(-2), ['week_direction', 'week_calendar']);
  const task = req.blocks.find((b) => b.kind === 'text' && b.label === 'task');
  assert.ok(task && task.kind === 'text' && dates.every((d) => task.text.includes(d)));
  assert.doesNotMatch(task.text, /2026-10-31/, 'nothing posts on Saturday');
  assert.match(task.text, /"linkedin": 0/, 'one LinkedIn post in a partial week needs no English');
  assert.match(task.text, /"tiktok": 1/);
  const usage = await prisma.aiUsage.findMany();
  assert.ok(usage.every((u) => u.task === 'content_titles' && u.actorId === '00000000-0000-4000-8000-000000000001'));
});

test('analyst writes the report narrative for a covered week', async () => {
  const narrative = { headline: '12 inscriptions', highlights: ['TikTok'], watch_outs: [] };
  const adapter = fake([{ json: narrative }]);
  const out = await runAgent('analyst', { kind: 'week_report', id: '2026-10-19' }, 'scheduled_job');
  assert.deepEqual(out, narrative);
  const req = adapter.calls[0]!.req;
  assert.equal(req.task, 'report_narrative');
  assert.deepEqual(labelsOf(req.blocks), ['task', 'editorial_line', 'objective', 'metrics', 'audience', 'publications']);
});

test('router errors are recorded on the run and rethrown without re-reporting', async () => {
  const { draft } = await draftFixture('linkedin');
  fake([{ error: 'refusal', refusalCategory: 'cyber' }]);
  await assert.rejects(runAgent('writer_linkedin', { kind: 'draft', id: draft.id }, 'scheduled_job'), AiRefusedError);
  let run = await prisma.agentRun.findFirstOrThrow();
  assert.equal(run.status, 'failed');
  assert.equal(run.errorCode, 'refusal');
  assert.equal(reported.length, 0);

  // Chain exhaustion: the router reports it once; runAgent only records it.
  await prisma.agentRun.deleteMany();
  await prisma.aiTaskRoute.deleteMany({ where: { task: 'post_linkedin' } });
  fake([]);
  await assert.rejects(runAgent('writer_linkedin', { kind: 'draft', id: draft.id }, 'scheduled_job'), AiUnavailableError);
  run = await prisma.agentRun.findFirstOrThrow();
  assert.equal(run.status, 'failed');
  assert.equal(run.errorCode, 'ai_unavailable');
  assert.deepEqual(
    reported.map((r) => r.scope),
    ['ai.router'],
  );
});

test('runAgent reports its own failures and records them on the run', async () => {
  fake([]);
  const missing = '00000000-0000-4000-8000-00000000dead';
  await assert.rejects(runAgent('writer_linkedin', { kind: 'draft', id: missing }, 'scheduled_job'));
  const run = await prisma.agentRun.findFirstOrThrow();
  assert.equal(run.status, 'failed');
  assert.equal(run.errorCode, 'context_error');
  assert.ok(run.finishedAt);
  assert.deepEqual(
    reported.map((r) => r.scope),
    ['content.agent'],
  );

  // An unknown subject kind is a programming error: refused before any AI call.
  await assert.rejects(runAgent('strategist', { kind: 'nope', id: 'x' }, 'scheduled_job'), /subject/);

  // No published version → nothing to run; reported, no run row possible.
  await prisma.agent.update({ where: { key: 'analyst' }, data: { publishedVersionId: null } });
  await assert.rejects(runAgent('analyst', { kind: 'week_report', id: '2026-10-19' }, 'scheduled_job'), /published/);
});
