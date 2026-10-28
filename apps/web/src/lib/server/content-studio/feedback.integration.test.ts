import '../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createContentDraft, createContentSlot, createContentWeek, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import type { AiTask } from '@gabee/types';
import { setErrorReporterForTests } from '../report-error';
import { HttpError } from '../http';
import { resetAiAdapters, setAiAdapters, type AiAdapter } from '../ai/router';
import { FakeAiAdapter, type FakeAiStep } from '../ai/router/fake-adapter';
import type { Actor } from './state';
import { recentFeedbackFor, recordFeedback } from './feedback';
import { regenerateDraft } from './drafts';
import { getWeek, regenerateProposals, regenerateSlot } from './weeks';

const prisma = createTestClient();
const actor: Actor = { id: randomUUID(), role: 'admin' };
const other: Actor = { id: randomUUID(), role: 'super_admin' };
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

const isHttp = (status: number, code: string) => (err: unknown) => err instanceof HttpError && err.status === status && err.code === code;

/** One scripted adapter per task; every call is kept in order to read the blocks each run received. */
type Call = { task: AiTask; blocks: Array<{ kind: string; label?: string; text?: string; trusted?: boolean }> };
function byTask(scripts: Partial<Record<AiTask, FakeAiStep[]>>): Call[] {
  const fakes = Object.fromEntries(Object.entries(scripts).map(([k, s]) => [k, new FakeAiAdapter(s!)])) as Partial<Record<AiTask, FakeAiAdapter>>;
  const calls: Call[] = [];
  const adapter: AiAdapter = {
    provider: 'anthropic',
    isAvailable: () => true,
    call: (...args) => {
      const req = args[2];
      calls.push({ task: req.task, blocks: req.blocks as Call['blocks'] });
      const f = fakes[req.task];
      if (!f) throw new Error(`no script for ${req.task}`);
      return f.call(...args);
    },
  };
  setAiAdapters([adapter]);
  return calls;
}

/** A block's text without its `<block label>` wrapper; undefined when the run had no such block. */
function blockText(call: Call | undefined, label: string): string | undefined {
  const b = call?.blocks.find((x) => x.kind === 'text' && x.label === label);
  return b?.text?.replace(/^<block label="[a-z_]+">\n/, '').replace(/\n<\/block>$/, '');
}
const feedbackOf = (call: Call | undefined) => {
  const text = blockText(call, 'owner_feedback');
  assert.ok(text !== undefined, 'every run gets an owner_feedback block');
  return text === 'No feedback from the owner yet.' ? [] : (JSON.parse(text) as Array<{ on: string; subject: string; verdict: string | null; note: string | null }>);
};

const proposals = {
  proposals: [0, 1, 2].map((i) => ({ title: `Direction ${i}`, rationale: `Pourquoi ${i}`, evidence: ['e'], sample_angles: ['a'] })),
};
const linkedinPost = { body: 'Votre enfant compte en jouant.', hashtags: ['#Gabee', '#Parents', '#Maths'], link_target: 'landing' as const };
const art = { media_asset_id: null, visual_brief: 'Un enfant devant la tablette' };

/** A titled week (Mon TikTok light, Tue LinkedIn value) of 2026-10-26, at `status`. */
async function titledWeek(status = 'titles_ready') {
  const week = await createContentWeek(prisma, { startsOn: new Date('2026-10-26'), firstDay: new Date('2026-10-26'), status, proposals, chosenIndex: 0, refinement: '' });
  const slotStatus = status === 'validated' ? 'validated' : 'proposed';
  const monday = await createContentSlot(prisma, week.id, {
    date: new Date('2026-10-26'),
    topic: 'Le saviez-vous ?',
    pillar: 'light',
    platforms: [{ platform: 'tiktok', language: 'en' }],
    status: slotStatus,
  });
  const tuesday = await createContentSlot(prisma, week.id, {
    date: new Date('2026-10-27'),
    topic: 'Compter les courses',
    pillar: 'value',
    platforms: [{ platform: 'linkedin', language: 'en' }],
    status: slotStatus,
  });
  return { week, monday, tuesday };
}

const titles = (tuesdayTopic = 'Compter les courses') => ({
  days: [
    { date: '2026-10-26', topic: 'Le saviez-vous ?', angle: 'a', format: 'text', pillar: 'light', platforms: [{ platform: 'tiktok', language: 'en' }], sources: [] },
    { date: '2026-10-27', topic: tuesdayTopic, angle: 'b', format: 'text', pillar: 'value', platforms: [{ platform: 'linkedin', language: 'en' }], sources: [] },
  ],
});

/** A ready LinkedIn draft (one agent version) on `slotId`. */
async function linkedinDraft(slotId: string) {
  const trackedUrl = 'https://gabee.app/en?utm_source=linkedin&utm_medium=social&utm_campaign=2026-10-26&utm_content=x';
  const draft = await createContentDraft(prisma, slotId, { platform: 'linkedin', language: 'en', status: 'ready', trackedUrl });
  const v = await prisma.contentDraftVersion.create({ data: { draftId: draft.id, n: 1, source: 'agent', payload: { ...linkedinPost, body: `${linkedinPost.body}\n\n${trackedUrl}` } } });
  return prisma.contentDraft.update({ where: { id: draft.id }, data: { currentVersionId: v.id } });
}

const audits = (kind: string) => prisma.auditLog.findMany({ where: { kind }, orderBy: { createdAt: 'asc' } });

// ── recordFeedback ──

test('feedback on each subject goes to its agent, with a reminder of the subject, and is audited', async () => {
  const { week, tuesday } = await titledWeek();
  const draft = await linkedinDraft(tuesday.id);
  const tiktok = await createContentDraft(prisma, tuesday.id, { platform: 'tiktok', status: 'ready' });

  const direction = await recordFeedback({ kind: 'direction', weekId: week.id, proposalIndex: 1, sentiment: 'down', note: '  Trop vendeur  ' }, actor);
  const title = await recordFeedback({ kind: 'title', slotId: tuesday.id, note: 'Plus concret' }, actor);
  const text = await recordFeedback({ kind: 'draft', draftId: draft.id, sentiment: 'up' }, actor);
  const media = await recordFeedback({ kind: 'draft', draftId: draft.id, about: 'media', note: 'Une photo de cahier' }, actor);
  const tt = await recordFeedback({ kind: 'draft', draftId: tiktok.id, note: 'Accroche plus rapide' }, actor);

  assert.deepEqual(
    [direction, title, text, media, tt].map((f) => [f?.agent_key, f?.subject_kind, f?.week_id]),
    [
      ['strategist', 'direction', week.id],
      ['strategist', 'title', week.id],
      ['writer_linkedin', 'draft', week.id],
      ['art_director', 'draft', week.id],
      ['writer_tiktok', 'draft', week.id],
    ],
  );
  assert.equal(direction?.note, 'Trop vendeur', 'notes are trimmed');
  assert.equal(direction?.proposal_index, 1);
  assert.equal(text?.note, null);
  const rows = await prisma.ownerFeedback.findMany({ orderBy: { createdAt: 'asc' } });
  assert.deepEqual(
    rows.map((r) => r.subjectSummary),
    ['Direction 1', '2026-10-27 · Compter les courses', 'LinkedIn · 2026-10-27 · Compter les courses', 'LinkedIn · 2026-10-27 · Compter les courses (média)', 'TikTok · 2026-10-27 · Compter les courses'],
  );

  const logged = await audits('content.feedback.record');
  assert.equal(logged.length, 5);
  assert.ok(logged.every((a) => a.actorId === actor.id && a.actorRole === 'admin'));
  assert.deepEqual(
    logged.map((a) => [a.targetKind, a.targetId]),
    [
      ['content_week', week.id],
      ['content_slot', tuesday.id],
      ['content_draft', draft.id],
      ['content_draft', draft.id],
      ['content_draft', tiktok.id],
    ],
  );
  assert.deepEqual(logged[0]!.diff, {
    subject_kind: 'direction',
    subject_id: week.id,
    agent_key: 'strategist',
    proposal_index: 1,
    before: null,
    after: { sentiment: 'down', note: 'Trop vendeur' },
  });
});

test('feedback on a missing subject is a 404, on a missing proposal a 422, and a day or draft note must say something', async () => {
  const { week, tuesday } = await titledWeek();
  const bare = await createContentWeek(prisma, { status: 'proposing' });
  await assert.rejects(recordFeedback({ kind: 'direction', weekId: randomUUID(), proposalIndex: 0, sentiment: 'up' }, actor), isHttp(404, 'week_not_found'));
  await assert.rejects(recordFeedback({ kind: 'direction', weekId: bare.id, proposalIndex: 0, sentiment: 'up' }, actor), isHttp(422, 'unknown_proposal'));
  await assert.rejects(recordFeedback({ kind: 'title', slotId: randomUUID(), note: 'x' }, actor), isHttp(404, 'slot_not_found'));
  await assert.rejects(recordFeedback({ kind: 'draft', draftId: randomUUID(), note: 'x' }, actor), isHttp(404, 'draft_not_found'));
  await assert.rejects(recordFeedback({ kind: 'title', slotId: tuesday.id, note: '   ' }, actor), isHttp(422, 'validation_error'));
  assert.equal(await prisma.ownerFeedback.count(), 0);
  assert.equal((await audits('content.feedback.record')).length, 0);
  // The database refuses a row that says nothing too.
  await assert.rejects(
    prisma.ownerFeedback.create({
      data: { agentKey: 'strategist', subjectKind: 'title', subjectId: tuesday.id, weekId: week.id, subjectSummary: 's', actorId: actor.id },
    }),
    /owner_feedback_says_something/,
  );
});

test('a direction feedback is changed in place per admin, cleared when emptied; day notes append', async () => {
  const { week, tuesday } = await titledWeek();
  await recordFeedback({ kind: 'direction', weekId: week.id, proposalIndex: 0, sentiment: 'up' }, actor);
  await recordFeedback({ kind: 'direction', weekId: week.id, proposalIndex: 0, sentiment: 'up', note: 'Garder le ton' }, actor);
  await recordFeedback({ kind: 'direction', weekId: week.id, proposalIndex: 0, sentiment: 'down' }, other);
  await recordFeedback({ kind: 'direction', weekId: week.id, proposalIndex: 2, sentiment: 'down' }, actor);

  assert.equal(await prisma.ownerFeedback.count({ where: { subjectKind: 'direction' } }), 3);
  // Each admin sees their own cards.
  assert.deepEqual((await getWeek(week.id, actor.id)).direction_feedback, [
    { proposal_index: 0, sentiment: 'up', note: 'Garder le ton' },
    { proposal_index: 2, sentiment: 'down', note: null },
  ]);
  assert.deepEqual((await getWeek(week.id, other.id)).direction_feedback, [{ proposal_index: 0, sentiment: 'down', note: null }]);
  assert.deepEqual((await getWeek(week.id)).direction_feedback, [], 'no viewer, no cards');

  // Both cleared: the row goes, and the audit says what it was.
  assert.equal(await recordFeedback({ kind: 'direction', weekId: week.id, proposalIndex: 2, sentiment: null, note: '  ' }, actor), null);
  assert.deepEqual((await getWeek(week.id, actor.id)).direction_feedback.map((f) => f.proposal_index), [0]);
  const last = (await audits('content.feedback.record')).at(-1)!;
  assert.deepEqual((last.diff as { before: unknown; after: unknown }).before, { sentiment: 'down', note: null });
  assert.equal((last.diff as { after: unknown }).after, null);

  await recordFeedback({ kind: 'title', slotId: tuesday.id, note: 'Un' }, actor);
  await recordFeedback({ kind: 'title', slotId: tuesday.id, note: 'Deux' }, actor);
  assert.equal(await prisma.ownerFeedback.count({ where: { subjectKind: 'title' } }), 2);
});

// ── recentFeedbackFor ──

test('recentFeedbackFor: its agent only, newest first, at most 15 of the last 60 days', async () => {
  const { week, tuesday } = await titledWeek();
  const now = new Date('2026-10-28T12:00:00Z');
  const at = (daysAgo: number, minutes = 0) => new Date(now.getTime() - daysAgo * 86_400_000 + minutes * 60_000);
  const rows = [
    ...Array.from({ length: 18 }, (_, i) => ({ agentKey: 'strategist', note: `n${i}`, updatedAt: at(1, i) })),
    { agentKey: 'strategist', note: 'trop vieux', updatedAt: at(61) },
    { agentKey: 'writer_linkedin', note: 'pour le rédacteur', updatedAt: at(0) },
  ];
  for (const r of rows) {
    await prisma.ownerFeedback.create({
      data: { ...r, subjectKind: 'title', subjectId: tuesday.id, weekId: week.id, subjectSummary: '2026-10-27 · Compter', actorId: actor.id, createdAt: r.updatedAt },
    });
  }
  const recent = await recentFeedbackFor('strategist', { now });
  assert.equal(recent.length, 15);
  assert.deepEqual(
    recent.map((r) => r.note),
    Array.from({ length: 15 }, (_, i) => `n${17 - i}`),
  );
  assert.deepEqual(recent[0], { date: '2026-10-27', on: 'day_title', subject: '2026-10-27 · Compter', sentiment: null, note: 'n17' });
  assert.equal((await recentFeedbackFor('strategist', { now, limit: 100 })).length, 18, 'the 61-day-old note is left out');
  assert.deepEqual((await recentFeedbackFor('writer_linkedin', { now })).map((r) => r.note), ['pour le rédacteur']);
  assert.deepEqual(await recentFeedbackFor('art_director', { now }), []);
  const newest = await prisma.ownerFeedback.findFirstOrThrow({ where: { note: 'n17' } });
  assert.equal((await recentFeedbackFor('strategist', { now, excludeId: newest.id }))[0]!.note, 'n16');
});

// ── Memory: each run gets its own agent's feedback ──

test('a draft regeneration gives the writer its notes and the Art director the media notes, nothing else', async () => {
  const { week, tuesday } = await titledWeek('validated');
  const draft = await linkedinDraft(tuesday.id);
  const tiktok = await createContentDraft(prisma, tuesday.id, { platform: 'tiktok', status: 'ready' });
  await recordFeedback({ kind: 'direction', weekId: week.id, proposalIndex: 0, sentiment: 'down', note: 'Pour le stratège' }, actor);
  await recordFeedback({ kind: 'draft', draftId: draft.id, note: 'Moins de jargon' }, actor);
  await recordFeedback({ kind: 'draft', draftId: draft.id, about: 'media', note: 'Pas de capture d’écran' }, actor);
  await recordFeedback({ kind: 'draft', draftId: tiktok.id, note: 'Pour TikTok' }, actor);

  const calls = byTask({ post_linkedin: [{ json: linkedinPost }], art_direction: [{ json: art }] });
  const out = await regenerateDraft(draft.id, actor);
  assert.equal(out.status, 'ready');
  const writer = calls.find((c) => c.task === 'post_linkedin');
  const director = calls.find((c) => c.task === 'art_direction');
  assert.deepEqual(
    feedbackOf(writer).map((f) => [f.on, f.note]),
    [['draft_text', 'Moins de jargon']],
  );
  assert.deepEqual(
    feedbackOf(director).map((f) => [f.on, f.note]),
    [['draft_media', 'Pas de capture d’écran']],
  );
  assert.equal(writer?.blocks.find((b) => b.label === 'owner_feedback')?.trusted, true);
  assert.equal(blockText(writer, 'owner_instruction'), undefined);
  assert.equal(reported.length, 0);
});

test('« Régénérer avec une consigne » on a draft: stored as a note to its writer, sent to the writer and the Art director', async () => {
  const { tuesday } = await titledWeek('validated');
  const draft = await linkedinDraft(tuesday.id);
  await recordFeedback({ kind: 'draft', draftId: draft.id, note: 'Note plus ancienne' }, actor);
  const calls = byTask({ post_linkedin: [{ json: linkedinPost }], art_direction: [{ json: art }] });

  await regenerateDraft(draft.id, actor, { instruction: '  Plus court, sans emoji  ' });
  const writer = calls.find((c) => c.task === 'post_linkedin');
  const director = calls.find((c) => c.task === 'art_direction');
  for (const call of [writer, director]) {
    assert.equal(blockText(call, 'owner_instruction'), 'Consigne du propriétaire pour cette régénération :\nPlus court, sans emoji');
  }
  // Said once: the instruction is not repeated in the run's own feedback block.
  assert.deepEqual(feedbackOf(writer).map((f) => f.note), ['Note plus ancienne']);

  const stored = await prisma.ownerFeedback.findFirstOrThrow({ where: { note: 'Plus court, sans emoji' } });
  assert.equal(stored.agentKey, 'writer_linkedin');
  assert.equal(stored.subjectKind, 'draft');
  assert.equal(stored.subjectId, draft.id);
  const [regen] = await audits('content.draft.regenerate');
  assert.equal((regen!.diff as { instruction?: string }).instruction, 'Plus court, sans emoji');

  // A blank instruction is none: nothing stored, no instruction block.
  const again = byTask({ post_linkedin: [{ json: linkedinPost }], art_direction: [{ json: art }] });
  await regenerateDraft(draft.id, actor, { instruction: '   ' });
  assert.equal(blockText(again[0], 'owner_instruction'), undefined);
  assert.equal(await prisma.ownerFeedback.count({ where: { subjectId: draft.id } }), 2);
});

test('« Régénérer avec une consigne » on a day: stored as a note on the title, sent to the Strategist with the day', async () => {
  const { tuesday } = await titledWeek();
  await recordFeedback({ kind: 'title', slotId: tuesday.id, note: 'Moins scolaire' }, actor);
  const calls = byTask({ content_titles: [{ json: titles('Les maths au marché') }] });

  const slot = await regenerateSlot(tuesday.id, actor, { instruction: 'Parler du marché' });
  assert.equal(slot.topic, 'Les maths au marché');
  assert.equal(calls.length, 1);
  assert.equal(
    blockText(calls[0], 'owner_instruction'),
    'Consigne du propriétaire pour cette régénération (jour du 2026-10-27 : seule la ligne de ce jour est gardée) :\nParler du marché',
  );
  assert.deepEqual(feedbackOf(calls[0]).map((f) => [f.on, f.subject, f.note]), [['day_title', '2026-10-27 · Compter les courses', 'Moins scolaire']]);
  const stored = await prisma.ownerFeedback.findFirstOrThrow({ where: { note: 'Parler du marché' } });
  assert.deepEqual([stored.agentKey, stored.subjectKind, stored.subjectId, stored.subjectSummary], ['strategist', 'title', tuesday.id, '2026-10-27 · Compter les courses']);
  const [regen] = await audits('content.slot.regenerate');
  assert.equal((regen!.diff as { instruction?: string }).instruction, 'Parler du marché');
});

test('regenerateProposals gives the Strategist the replaced proposals with the owner’s 👍/👎, then frees the cards', async () => {
  const { week } = await titledWeek();
  await recordFeedback({ kind: 'direction', weekId: week.id, proposalIndex: 0, sentiment: 'down', note: 'Déjà fait' }, actor);
  await recordFeedback({ kind: 'direction', weekId: week.id, proposalIndex: 2, sentiment: 'up' }, actor);
  const fresh = { proposals: [0, 1, 2].map((i) => ({ title: `Nouvelle ${i}`, rationale: 'r', evidence: [], sample_angles: [] })) };
  const calls = byTask({ content_strategy: [{ json: fresh }] });

  const out = await regenerateProposals(week.id, actor);
  assert.equal(out.status, 'proposals_ready');
  assert.deepEqual(out.direction_feedback, [], 'the new cards start blank');
  assert.deepEqual(JSON.parse(blockText(calls[0], 'replaced_proposals')!), [
    { title: 'Direction 0', rationale: 'Pourquoi 0', owner_feedback: [{ verdict: 'disliked', note: 'Déjà fait' }] },
    { title: 'Direction 1', rationale: 'Pourquoi 1', owner_feedback: [] },
    { title: 'Direction 2', rationale: 'Pourquoi 2', owner_feedback: [{ verdict: 'liked', note: null }] },
  ]);
  // The feedback stays in memory with the title it was about.
  assert.deepEqual(
    feedbackOf(calls[0]).map((f) => [f.on, f.subject, f.verdict]).sort(),
    [
      ['direction', 'Direction 0', 'disliked'],
      ['direction', 'Direction 2', 'liked'],
    ],
  );
  assert.equal(await prisma.ownerFeedback.count({ where: { subjectId: week.id, proposalIndex: null } }), 2);
  const [audit] = await audits('content.week.repropose');
  assert.equal((audit!.diff as { direction_feedback: number }).direction_feedback, 2);

  // A 👍 on a new card is a fresh row, not the old one.
  await recordFeedback({ kind: 'direction', weekId: week.id, proposalIndex: 0, sentiment: 'up' }, actor);
  assert.deepEqual((await getWeek(week.id, actor.id)).direction_feedback, [{ proposal_index: 0, sentiment: 'up', note: null }]);
  assert.equal(await prisma.ownerFeedback.count({ where: { subjectId: week.id } }), 3);
});
