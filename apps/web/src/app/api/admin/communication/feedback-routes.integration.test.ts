import '../../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createContentDraft, createContentSlot, createContentWeek, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import type { AiTask } from '@gabee/types';
import { createLoginableParent } from '@/test/factories';
import { adminCookie, parentCookie, parentToken, webRequest } from '@/test/auth';
import { setErrorReporterForTests } from '@/lib/server/report-error';
import { resetAiAdapters, setAiAdapters, type AiAdapter } from '@/lib/server/ai/router';
import { FakeAiAdapter, type FakeAiStep } from '@/lib/server/ai/router/fake-adapter';
import { POST as weekFeedback } from './weeks/[id]/feedback/route';
import { GET as getWeek } from './weeks/[id]/route';
import { POST as slotFeedback } from './slots/[id]/feedback/route';
import { POST as regenerateSlot } from './slots/[id]/regenerate/route';
import { POST as draftFeedback } from './drafts/[id]/feedback/route';
import { POST as regenerateDraft } from './drafts/[id]/regenerate/route';

// « Retours aux agents »: the three feedback routes, and the regenerate routes' optional instruction.

const prisma = createTestClient();
const U = 'http://localhost/api/admin/communication';
let cookie: { name: string; value: string };
let adminId: string;

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  adminId = parent.id;
  cookie = adminCookie(await parentToken(parent.id, parent.email));
  setErrorReporterForTests(() => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  resetAiAdapters();
  setErrorReporterForTests(null);
  mock.restoreAll();
});
after(() => prisma.$disconnect());

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (path: string, body?: unknown) => webRequest(`${U}${path}`, { cookie, ...(body !== undefined ? { body } : {}) });
/** As someone else: `c` undefined is no session at all. */
const postAs = (c: { name: string; value: string } | undefined, path: string, body: unknown) => webRequest(`${U}${path}`, { cookie: c, body });
/** A raw body under a given content type (JSON by default; a body must be declared JSON). */
const raw = (path: string, body: string, type = 'application/json') =>
  new NextRequest(`${U}${path}`, { method: 'POST', headers: { cookie: `${cookie.name}=${cookie.value}`, 'content-type': type }, body });

function byTask(scripts: Partial<Record<AiTask, FakeAiStep[]>>): void {
  const fakes = Object.fromEntries(Object.entries(scripts).map(([k, s]) => [k, new FakeAiAdapter(s!)])) as Partial<Record<AiTask, FakeAiAdapter>>;
  const adapter: AiAdapter = {
    provider: 'anthropic',
    isAvailable: () => true,
    call: (...args) => {
      const f = fakes[args[2].task];
      if (!f) throw new Error(`no script for ${args[2].task}`);
      return f.call(...args);
    },
  };
  setAiAdapters([adapter]);
}

const proposals = { proposals: [0, 1, 2].map((i) => ({ title: `Direction ${i}`, rationale: 'r', evidence: [], sample_angles: [] })) };
const linkedinPost = { body: 'Votre enfant compte en jouant.', hashtags: ['#Gabee', '#Parents', '#Maths'], link_target: 'landing' as const };

/** A week of 2026-10-26 with one LinkedIn day (Tuesday) and a ready LinkedIn draft on it. */
async function fixture(status = 'titles_ready') {
  const week = await createContentWeek(prisma, { startsOn: new Date('2026-10-26'), firstDay: new Date('2026-10-26'), status, proposals, chosenIndex: 0, refinement: '' });
  const monday = await createContentSlot(prisma, week.id, {
    date: new Date('2026-10-26'),
    topic: 'Le saviez-vous ?',
    pillar: 'light',
    platforms: [{ platform: 'tiktok', language: 'en' }],
    status: status === 'validated' ? 'validated' : 'proposed',
  });
  const slot = await createContentSlot(prisma, week.id, {
    date: new Date('2026-10-27'),
    topic: 'Compter les courses',
    pillar: 'value',
    platforms: [{ platform: 'linkedin', language: 'en' }],
    status: status === 'validated' ? 'validated' : 'proposed',
  });
  const trackedUrl = 'https://gabee.app/en?utm_source=linkedin&utm_medium=social&utm_campaign=2026-10-26&utm_content=x';
  const draft = await createContentDraft(prisma, slot.id, { platform: 'linkedin', language: 'en', status: 'ready', trackedUrl });
  const v = await prisma.contentDraftVersion.create({ data: { draftId: draft.id, n: 1, source: 'agent', payload: { ...linkedinPost, body: `${linkedinPost.body}\n\n${trackedUrl}` } } });
  await prisma.contentDraft.update({ where: { id: draft.id }, data: { currentVersionId: v.id } });
  return { week, monday, slot, draft };
}

const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

test('feedback routes need an admin: no session → 401, parent → 403', async () => {
  const { week, slot, draft } = await fixture();
  const { parent } = await createLoginableParent(prisma, { role: 'parent' });
  const pc = parentCookie(await parentToken(parent.id, parent.email));
  const calls: Array<[string, (c: { name: string; value: string } | undefined) => Promise<Response> | Response]> = [
    ['week feedback', (c) => weekFeedback(postAs(c, `/weeks/${week.id}/feedback`, { proposal_index: 0, sentiment: 'up' }), ctx(week.id))],
    ['slot feedback', (c) => slotFeedback(postAs(c, `/slots/${slot.id}/feedback`, { note: 'x' }), ctx(slot.id))],
    ['draft feedback', (c) => draftFeedback(postAs(c, `/drafts/${draft.id}/feedback`, { note: 'x' }), ctx(draft.id))],
  ];
  for (const [name, call] of calls) {
    assert.equal((await call(undefined)).status, 401, `${name} without a session`);
    assert.equal((await call(pc)).status, 403, `${name} as a parent`);
  }
  assert.equal(await prisma.ownerFeedback.count(), 0);
});

test('a direction card’s 👍/👎 and note are saved, shown back to their admin, and cleared', async () => {
  const { week } = await fixture();
  const res = await weekFeedback(post(`/weeks/${week.id}/feedback`, { proposal_index: 1, sentiment: 'down', note: 'Trop vendeur' }), ctx(week.id));
  assert.equal(res.status, 200);
  const { feedback } = (await res.json()) as { feedback: { agent_key: string; sentiment: string; note: string } };
  assert.deepEqual([feedback.agent_key, feedback.sentiment, feedback.note], ['strategist', 'down', 'Trop vendeur']);

  const shown = (await (await getWeek(webRequest(`${U}/weeks/${week.id}`, { method: 'GET', cookie }), ctx(week.id))).json()) as {
    week: { direction_feedback: unknown[] };
  };
  assert.deepEqual(shown.week.direction_feedback, [{ proposal_index: 1, sentiment: 'down', note: 'Trop vendeur' }]);

  const cleared = await weekFeedback(post(`/weeks/${week.id}/feedback`, { proposal_index: 1 }), ctx(week.id));
  assert.equal(cleared.status, 200);
  assert.deepEqual(await cleared.json(), { feedback: null });
  assert.equal(await prisma.ownerFeedback.count(), 0);
  assert.equal(await prisma.auditLog.count({ where: { kind: 'content.feedback.record', actorId: adminId } }), 2);
});

test('feedback routes refuse a bad body (422), a missing proposal (422) and unknown subjects (404)', async () => {
  const { week, slot, draft } = await fixture();
  const bare = await createContentWeek(prisma, { status: 'proposing' });
  const cases: Array<[string, Promise<Response> | Response, number, string]> = [
    ['index out of range', weekFeedback(post(`/weeks/${week.id}/feedback`, { proposal_index: 5, sentiment: 'up' }), ctx(week.id)), 422, 'validation_error'],
    ['no proposals yet', weekFeedback(post(`/weeks/${bare.id}/feedback`, { proposal_index: 0, sentiment: 'up' }), ctx(bare.id)), 422, 'unknown_proposal'],
    ['empty day note', slotFeedback(post(`/slots/${slot.id}/feedback`, { note: '  ' }), ctx(slot.id)), 422, 'validation_error'],
    ['note too long', draftFeedback(post(`/drafts/${draft.id}/feedback`, { note: 'x'.repeat(1001) }), ctx(draft.id)), 422, 'validation_error'],
    ['unknown week', weekFeedback(post(`/weeks/${randomUUID()}/feedback`, { proposal_index: 0, sentiment: 'up' }), ctx(randomUUID())), 404, 'week_not_found'],
    ['unknown day', slotFeedback(post(`/slots/x/feedback`, { note: 'x' }), ctx(randomUUID())), 404, 'slot_not_found'],
    ['unknown draft', draftFeedback(post(`/drafts/x/feedback`, { note: 'x' }), ctx(randomUUID())), 404, 'draft_not_found'],
    ['not an id', draftFeedback(post(`/drafts/x/feedback`, { note: 'x' }), ctx('nope')), 404, 'not_found'],
  ];
  for (const [name, call, status, code] of cases) {
    const res = await call;
    assert.equal(res.status, status, name);
    assert.equal(await errorCode(res), code, name);
  }
  assert.equal(await prisma.ownerFeedback.count(), 0);
});

test('« Commenter » a day and a draft (text or media) records a note for the right agent', async () => {
  const { slot, draft } = await fixture();
  assert.equal((await slotFeedback(post(`/slots/${slot.id}/feedback`, { note: 'Plus concret' }), ctx(slot.id))).status, 200);
  assert.equal((await draftFeedback(post(`/drafts/${draft.id}/feedback`, { note: 'Moins long' }), ctx(draft.id))).status, 200);
  assert.equal((await draftFeedback(post(`/drafts/${draft.id}/feedback`, { note: 'Une photo', about: 'media' }), ctx(draft.id))).status, 200);
  const rows = await prisma.ownerFeedback.findMany({ orderBy: { createdAt: 'asc' } });
  assert.deepEqual(
    rows.map((r) => [r.agentKey, r.subjectKind, r.note, r.actorId]),
    [
      ['strategist', 'title', 'Plus concret', adminId],
      ['writer_linkedin', 'draft', 'Moins long', adminId],
      ['art_director', 'draft', 'Une photo', adminId],
    ],
  );
});

test('the regenerate routes take an optional instruction; a body not declared JSON is refused', async () => {
  const { slot, draft } = await fixture('validated');
  byTask({
    content_titles: [
      {
        json: {
          days: [
            { date: '2026-10-26', topic: 'Le saviez-vous ?', angle: 'a', format: 'text', pillar: 'light', platforms: [{ platform: 'tiktok', language: 'en' }], sources: [] },
            { date: '2026-10-27', topic: 'Au marché', angle: 'b', format: 'text', pillar: 'value', platforms: [{ platform: 'linkedin', language: 'en' }], sources: [] },
          ],
        },
      },
    ],
    post_linkedin: [{ json: linkedinPost }],
    art_direction: [{ json: { media_asset_id: null, visual_brief: 'b' } }],
  });
  const day = await regenerateSlot(raw(`/slots/${slot.id}/regenerate`, JSON.stringify({ instruction: 'Parler du marché' })), ctx(slot.id));
  assert.equal(day.status, 200);
  const post1 = await regenerateDraft(post(`/drafts/${draft.id}/regenerate`, { instruction: 'Plus court' }), ctx(draft.id));
  assert.equal(post1.status, 200);
  const notes = (await prisma.ownerFeedback.findMany({ orderBy: { createdAt: 'asc' } })).map((r) => [r.agentKey, r.note]);
  assert.deepEqual(notes, [
    ['strategist', 'Parler du marché'],
    ['writer_linkedin', 'Plus court'],
  ]);

  const tooLong = await regenerateDraft(post(`/drafts/${draft.id}/regenerate`, { instruction: 'x'.repeat(501) }), ctx(draft.id));
  assert.equal(tooLong.status, 422);
  const badJson = await regenerateDraft(raw(`/drafts/${draft.id}/regenerate`, '{', 'application/json'), ctx(draft.id));
  assert.equal(badJson.status, 400);
  assert.equal(await errorCode(badJson), 'invalid_json');
  const plain = await regenerateDraft(raw(`/drafts/${draft.id}/regenerate`, JSON.stringify({ instruction: 'Plus court' }), 'text/plain'), ctx(draft.id));
  assert.equal(plain.status, 415);
  assert.equal(await errorCode(plain), 'unsupported_media_type');
});
