import '../../../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createContentDraft, createContentSlot, createContentWeek, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import { DEFAULT_POSTING_DAYS, type AiTask } from '@gabee/types';
import { createLoginableParent } from '@/test/factories';
import { adminCookie, parentCookie, parentToken, webRequest } from '@/test/auth';
import { setErrorReporterForTests } from '@/lib/server/report-error';
import { resetAiAdapters, setAiAdapters, type AiAdapter } from '@/lib/server/ai/router';
import { FakeAiAdapter, type FakeAiStep } from '@/lib/server/ai/router/fake-adapter';
import { localParts } from '@/lib/server/content-studio/clock';
import { addDaysYmd } from '@/lib/server/content-studio/state';
import { plannedDays } from '@/lib/server/content-studio/cadence';
import { GET as listWeeks, POST as startNow } from './route';
import { GET as getWeek } from './[id]/route';
import { POST as propose } from './[id]/propose/route';
import { POST as regenerateProposals } from './[id]/regenerate-proposals/route';
import { POST as direction } from './[id]/direction/route';
import { POST as validate } from './[id]/validate/route';
import { PATCH as patchSlot } from '../slots/[id]/route';
import { POST as regenerateSlot } from '../slots/[id]/regenerate/route';
import { POST as skipSlot } from '../slots/[id]/skip/route';
import { GET as today } from '../today/route';
import { GET as pending } from '../pending/route';

const prisma = createTestClient();
const U = 'http://localhost/api/admin/communication';
let cookie: { name: string; value: string };
let adminId: string;
let reported: unknown[] = [];

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  adminId = parent.id;
  cookie = adminCookie(await parentToken(parent.id, parent.email));
  reported = [];
  setErrorReporterForTests((err) => reported.push(err));
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  resetAiAdapters();
  setErrorReporterForTests(null);
  mock.restoreAll();
});
after(() => prisma.$disconnect());

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (path: string, c = cookie) => webRequest(`${U}${path}`, { method: 'GET', cookie: c });
const post = (path: string, body?: unknown, c = cookie) => webRequest(`${U}${path}`, { cookie: c, ...(body !== undefined ? { body } : {}) });
const patch = (path: string, body: unknown) => webRequest(`${U}${path}`, { method: 'PATCH', cookie, body });

function fake(script: FakeAiStep[]): FakeAiAdapter {
  const adapter = new FakeAiAdapter(script);
  setAiAdapters([adapter]);
  return adapter;
}

/** One scripted adapter per task (writers and Art director run in any order). */
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

const proposals = {
  proposals: [0, 1, 2].map((i) => ({ title: `Direction ${i}`, rationale: 'r', evidence: ['e'], sample_angles: ['a'] })),
};

/** A titles answer: each date with both platforms, the first one light. */
function titlesFor(dates: string[]) {
  return {
    days: dates.map((date, i) => ({
      date,
      topic: `Sujet ${date}`,
      angle: `Angle ${i}`,
      format: 'text',
      pillar: i === 0 ? 'light' : 'value',
      platforms: [
        { platform: 'linkedin', language: i < 2 ? 'en' : 'fr' },
        { platform: 'tiktok', language: i < 2 ? 'en' : 'fr' },
      ],
      sources: [],
    })),
  };
}

const DOUALA = 'Africa/Douala';
const studioToday = () => localParts(new Date(), DOUALA);
const mondayOf = (p: { date: string; weekday: number }) => addDaysYmd(p.date, -((p.weekday + 6) % 7));

test('studio routes need an admin: no session → 401, parent → 403', async () => {
  const { parent } = await createLoginableParent(prisma, { role: 'parent' });
  const pc = parentCookie(await parentToken(parent.id, parent.email));
  const week = await createContentWeek(prisma);
  const calls: Array<[string, (c: { name: string; value: string } | undefined) => Promise<Response> | Response]> = [
    ['GET weeks', (c) => listWeeks(webRequest(`${U}/weeks`, { method: 'GET', cookie: c }), undefined)],
    ['POST weeks', (c) => startNow(webRequest(`${U}/weeks`, { cookie: c }), undefined)],
    ['GET week', (c) => getWeek(webRequest(`${U}/weeks/${week.id}`, { method: 'GET', cookie: c }), ctx(week.id))],
    ['POST propose', (c) => propose(webRequest(`${U}/weeks/${week.id}/propose`, { cookie: c }), ctx(week.id))],
    ['POST regenerate-proposals', (c) => regenerateProposals(webRequest(`${U}/weeks/${week.id}/regenerate-proposals`, { cookie: c }), ctx(week.id))],
    ['GET today', (c) => today(webRequest(`${U}/today`, { method: 'GET', cookie: c }), undefined)],
    ['GET pending', (c) => pending(webRequest(`${U}/pending`, { method: 'GET', cookie: c }), undefined)],
  ];
  for (const [name, call] of calls) {
    assert.equal((await call(undefined)).status, 401, `${name} without a session`);
    assert.equal((await call(pc)).status, 403, `${name} as a parent`);
  }
  assert.equal(await prisma.contentWeek.count(), 1, 'nothing was started');
});

test('start now proposes directions and GET weeks finds it in the studio calendar', async () => {
  fake([{ json: proposals }]);
  const res = await startNow(post('/weeks'), undefined);
  assert.equal(res.status, 200);
  const { week } = await res.json();
  assert.equal(week.status, 'proposals_ready');
  assert.equal(week.proposals.length, 3);

  const p = studioToday();
  const found = await (await listWeeks(get('/weeks'), undefined)).json();
  assert.equal(found.today, p.date);
  // Sunday plans next week; Monday–Saturday plans the current week from tomorrow.
  const [hit, miss] = p.weekday === 0 ? ['next', 'current'] : ['current', 'next'];
  assert.equal(found[hit]?.id, week.id);
  assert.equal(found[miss], null);
  assert.equal(found.current?.starts_on ?? mondayOf(p), mondayOf(p));

  const again = await startNow(post('/weeks'), undefined);
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.code, 'week_exists');
});

test('GET weeks: on any day "next" is the Monday after the current week', async () => {
  const p = studioToday();
  const current = await createContentWeek(prisma, { startsOn: new Date(mondayOf(p)), firstDay: new Date(mondayOf(p)) });
  const next = await createContentWeek(prisma, { startsOn: new Date(addDaysYmd(mondayOf(p), 7)), firstDay: new Date(addDaysYmd(mondayOf(p), 7)) });
  const found = await (await listWeeks(get('/weeks'), undefined)).json();
  assert.equal(found.current.id, current.id);
  assert.equal(found.next.id, next.id);
});

test('direction POST maps AiRefusedError to 422 ai_refused', async () => {
  const week = await createContentWeek(prisma, { status: 'proposals_ready', proposals });
  fake([{ error: 'refusal', refusalCategory: 'cyber' }]);
  const res = await direction(post(`/weeks/${week.id}/direction`, { proposal_index: 1, refinement: '', platform_angles: {} }), ctx(week.id));
  assert.equal(res.status, 422);
  const { error } = await res.json();
  assert.equal(error.code, 'ai_refused');
  assert.match(error.message, /L'IA a refusé/);
  assert.match(error.message, /précision/, 'the direction route asks to rephrase the precision');
  assert.equal(reported.length, 1, 'a refusal is reported once, by the API');
  assert.equal((await prisma.contentWeek.findUniqueOrThrow({ where: { id: week.id } })).status, 'direction_set');
});

test('a refusal on a route without owner text gets the generic copy (no precision hint)', async () => {
  const week = await createContentWeek(prisma, { status: 'proposing' });
  fake([{ error: 'refusal', refusalCategory: 'cyber' }]);
  const res = await propose(post(`/weeks/${week.id}/propose`), ctx(week.id));
  assert.equal(res.status, 422);
  const { error } = await res.json();
  assert.equal(error.code, 'ai_refused');
  assert.equal(error.message, "L'IA a refusé cette demande. Réessayez ; si cela se répète, voyez le Journal.");
});

test('an unavailable AI maps to 503 ai_unavailable, reported once (by the router)', async () => {
  const week = await createContentWeek(prisma, { status: 'proposing' });
  fake([{ error: 'outage' }, { error: 'outage' }, { error: 'outage' }]);
  const res = await propose(post(`/weeks/${week.id}/propose`), ctx(week.id));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'ai_unavailable');
  assert.equal(reported.length, 1);
});

test('an unusable AI answer (twice) maps to 422 ai_invalid_output, reported once by the API', async () => {
  const week = await createContentWeek(prisma, { status: 'proposing' });
  const adapter = fake([{ json: { proposals: [] } }, { json: { nope: true } }]);
  const res = await propose(post(`/weeks/${week.id}/propose`), ctx(week.id));
  assert.equal(res.status, 422);
  const { error } = await res.json();
  assert.equal(error.code, 'ai_invalid_output');
  assert.match(error.message, /résultat inutilisable/);
  assert.equal(adapter.calls.length, 2, 'runAgent retried once');
  assert.equal(reported.length, 1, 'invalid output is reported once, by the API');
  assert.equal((await prisma.contentWeek.findUniqueOrThrow({ where: { id: week.id } })).status, 'proposing');
});

test('slot regenerate on a validated day due today writes its drafts, audited as the acting admin', async () => {
  const p = studioToday();
  const week = await createContentWeek(prisma, {
    startsOn: new Date(mondayOf(p)),
    firstDay: new Date(p.date),
    status: 'validated',
    proposals,
    chosenIndex: 0,
    refinement: '',
  });
  const slot = await createContentSlot(prisma, week.id, {
    date: new Date(p.date),
    topic: 'Compter les courses',
    status: 'validated',
  });
  // The week's only line: a day regenerate re-plans the week's existing lines.
  byTask({
    content_titles: [{ json: titlesFor([p.date]) }],
    post_linkedin: [{ json: { body: 'Votre enfant compte en jouant.', hashtags: ['#Gabee', '#Parents', '#Maths'], link_target: 'landing' } }],
    post_tiktok: [
      {
        json: {
          caption: 'Une minute de calcul. Lien en bio !',
          hashtags: ['#Gabee', '#Parents', '#Maths'],
          on_screen_text: ['3 + 4 ?'],
          mode: 'filming_plan',
          filming_plan: { hook: "L'écran du jeu", shots: ['Écran du module Nombres'], duration_s: 20 },
        },
      },
    ],
    art_direction: [{ json: { media_asset_id: null, visual_brief: 'Un enfant' } }, { json: { media_asset_id: null, visual_brief: 'Un enfant' } }],
  });

  const res = await regenerateSlot(post(`/slots/${slot.id}/regenerate`), ctx(slot.id));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.slot.topic, `Sujet ${p.date}`);
  const byPlatform = Object.fromEntries(body.slot.drafts.map((d: { platform: string; status: string }) => [d.platform, d.status]));
  assert.deepEqual(byPlatform, { linkedin: 'ready', tiktok: 'ready' }, 'afterSlotChange wrote the day');

  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
  assert.deepEqual(rows.map((r) => r.kind).sort(), ['content.day.generate', 'content.slot.regenerate']);
  const generated = rows.find((r) => r.kind === 'content.day.generate')!;
  assert.equal(generated.actorId, adminId);
  assert.equal(generated.actorRole, 'admin');
  assert.equal(generated.targetId, slot.id);
  assert.deepEqual(generated.diff, { day: p.date, created: 2, failed: 0 });
});

test('regenerate-proposals starts a titled week over with the current objective, audited as the acting admin', async () => {
  const week = await createContentWeek(prisma, { status: 'titles_ready', proposals, chosenIndex: 2, refinement: 'Plus concret' });
  await createContentSlot(prisma, week.id, { status: 'proposed' });
  const objective = await prisma.contentObjective.create({
    data: { month: week.startsOn.toISOString().slice(0, 7), type: 'signups', statement: 'Cinquante familles' },
  });
  const fresh = { proposals: proposals.proposals.map((p) => ({ ...p, title: `Nouvelle ${p.title}` })) };
  const adapter = fake([{ json: fresh }]);

  const res = await regenerateProposals(post(`/weeks/${week.id}/regenerate-proposals`), ctx(week.id));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.week.status, 'proposals_ready');
  assert.equal(body.week.proposals[0].title, 'Nouvelle Direction 0');
  assert.equal(body.week.chosen_index, null);
  assert.deepEqual(body.week.slots, []);
  assert.equal(body.week.objective_id, objective.id);
  assert.equal(body.week.month_objective_set, true);
  assert.equal(adapter.calls.length, 1);

  const audit = await prisma.auditLog.findFirstOrThrow({ where: { kind: 'content.week.repropose' } });
  assert.equal(audit.actorId, adminId);
  assert.equal(audit.actorRole, 'admin');
  assert.equal(audit.targetId, week.id);

  // A week still proposing belongs to "Relancer"; a validated one is regenerated day by day.
  for (const status of ['proposing', 'validated']) {
    const other = await createContentWeek(prisma, { status });
    const refused = await regenerateProposals(post(`/weeks/${other.id}/regenerate-proposals`), ctx(other.id));
    assert.equal(refused.status, 409, status);
    assert.equal((await refused.json()).error.code, 'invalid_transition');
  }
  const bad = await regenerateProposals(post('/weeks/nope/regenerate-proposals'), ctx('nope'));
  assert.equal(bad.status, 404);
});

test('regenerate-proposals maps a live run to 409 and an unavailable AI to 503', async () => {
  const week = await createContentWeek(prisma, { status: 'proposals_ready', proposals });
  const agent = await prisma.agent.findUniqueOrThrow({ where: { key: 'strategist' } });
  const run = await prisma.agentRun.create({
    data: { agentKey: 'strategist', agentVersionId: agent.publishedVersionId!, origin: 'user_action', subjectKind: 'week_proposals', subjectId: week.id, inputHash: 'h', input: {}, status: 'running' },
  });
  const busy = await regenerateProposals(post(`/weeks/${week.id}/regenerate-proposals`), ctx(week.id));
  assert.equal(busy.status, 409);
  assert.equal((await busy.json()).error.code, 'generation_in_progress');

  await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'failed' } });
  fake([{ error: 'outage' }, { error: 'outage' }, { error: 'outage' }]);
  const down = await regenerateProposals(post(`/weeks/${week.id}/regenerate-proposals`), ctx(week.id));
  assert.equal(down.status, 503);
  assert.equal((await down.json()).error.code, 'ai_unavailable');
  assert.equal((await prisma.contentWeek.findUniqueOrThrow({ where: { id: week.id } })).status, 'proposing', 'left for "Relancer"');
});

test('invalid ids answer 404, unknown ids 404 week_not_found', async () => {
  const bad = await getWeek(get('/weeks/nope'), ctx('nope'));
  assert.equal(bad.status, 404);
  const id = '00000000-0000-4000-8000-000000000000';
  const missing = await getWeek(get(`/weeks/${id}`), ctx(id));
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'week_not_found');
});

test('validate refuses below the English minimum, then validates with override_quota', async () => {
  const week = await createContentWeek(prisma, { status: 'titles_ready' });
  await createContentSlot(prisma, week.id, { status: 'proposed' });
  const refused = await validate(post(`/weeks/${week.id}/validate`, {}), ctx(week.id));
  assert.equal(refused.status, 409);
  const { error } = await refused.json();
  assert.equal(error.code, 'language_quota');
  assert.equal(error.details.length, 2);

  const ok = await validate(post(`/weeks/${week.id}/validate`, { override_quota: true }), ctx(week.id));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).week.status, 'validated');
});

test('validate reads the body whatever its content type: empty = no override, bad JSON = 400', async () => {
  const week = await createContentWeek(prisma, { status: 'titles_ready' });
  await createContentSlot(prisma, week.id, { status: 'proposed' });
  // A raw body (webRequest always sends JSON with its content type).
  const raw = (body: string | undefined, contentType?: string) =>
    validate(
      new NextRequest(`${U}/weeks/${week.id}/validate`, {
        method: 'POST',
        headers: { cookie: `${cookie.name}=${cookie.value}`, ...(contentType ? { 'content-type': contentType } : {}) },
        ...(body === undefined ? {} : { body }),
      }),
      ctx(week.id),
    );

  const empty = await raw(undefined);
  assert.equal(empty.status, 409, 'no body = no override');
  assert.equal((await empty.json()).error.code, 'language_quota');

  const bad = await raw('{not json', 'application/json');
  assert.equal(bad.status, 400);
  const { error } = await bad.json();
  assert.equal(error.code, 'invalid_json');
  assert.match(error.message, /JSON invalide/);

  const wrongShape = await raw('{"override_quota":"yes"}', 'text/plain');
  assert.equal(wrongShape.status, 422);

  // A JSON body sent as text/plain (no JSON content type) is still honoured.
  const ok = await raw('{"override_quota":true}', 'text/plain;charset=UTF-8');
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).week.status, 'validated');
});

test('slot PATCH on a validated day due today writes the added platform and warns on the quota', async () => {
  const p = studioToday();
  const week = await createContentWeek(prisma, {
    startsOn: new Date(mondayOf(p)),
    firstDay: new Date(p.date),
    status: 'validated',
    proposals,
    chosenIndex: 0,
    refinement: '',
  });
  const slot = await createContentSlot(prisma, week.id, {
    date: new Date(p.date),
    topic: 'Compter les courses',
    platforms: [{ platform: 'linkedin', language: 'en' }],
    status: 'drafted',
  });
  await createContentDraft(prisma, slot.id, { platform: 'linkedin', language: 'en', status: 'ready' });
  byTask({
    post_tiktok: [
      {
        json: {
          caption: 'Une minute de calcul. Lien en bio !',
          hashtags: ['#Gabee', '#Parents', '#Maths'],
          on_screen_text: ['3 + 4 ?'],
          mode: 'filming_plan',
          filming_plan: { hook: "L'écran du jeu", shots: ['Écran du module Nombres'], duration_s: 20 },
        },
      },
    ],
    art_direction: [{ json: { media_asset_id: null, visual_brief: 'Un enfant devant la tablette' } }],
  });

  const res = await patchSlot(
    patch(`/slots/${slot.id}`, {
      platforms: [
        { platform: 'linkedin', language: 'fr' },
        { platform: 'tiktok', language: 'fr' },
      ],
    }),
    ctx(slot.id),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  const byPlatform = Object.fromEntries(body.slot.drafts.map((d: { platform: string; status: string }) => [d.platform, d.status]));
  assert.deepEqual(byPlatform, { linkedin: 'stale', tiktok: 'ready' });
  assert.equal(body.warning?.code, 'language_quota');
  const kinds = (await prisma.auditLog.findMany()).map((a) => a.kind).sort();
  assert.deepEqual(kinds, ['content.day.generate', 'content.slot.update']);
});

test('slot PATCH on a week not yet validated generates nothing and has no warning', async () => {
  const week = await createContentWeek(prisma, { status: 'titles_ready' });
  const slot = await createContentSlot(prisma, week.id, { status: 'proposed' });
  const adapter = fake([]);
  const res = await patchSlot(patch(`/slots/${slot.id}`, { topic: 'Nouveau sujet' }), ctx(slot.id));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.slot.topic, 'Nouveau sujet');
  assert.equal(body.warning, null);
  assert.equal(adapter.calls.length, 0);
});

test('today and pending use the studio-local day', async () => {
  const p = studioToday();
  const week = await createContentWeek(prisma, { startsOn: new Date(mondayOf(p)), firstDay: new Date(mondayOf(p)), status: 'validated' });
  const slot = await createContentSlot(prisma, week.id, { date: new Date(p.date), status: 'drafted' });
  await createContentDraft(prisma, slot.id, { platform: 'linkedin', status: 'ready' });
  await createContentDraft(prisma, slot.id, { platform: 'tiktok', status: 'approved' });

  const board = await (await today(get('/today'), undefined)).json();
  assert.equal(board.day, p.date);
  assert.equal(board.week_status, 'validated');
  assert.equal(board.slot.id, slot.id);

  const counts = await (await pending(get('/pending'), undefined)).json();
  assert.deepEqual(counts, { proposals: 0, titles: 0, approve: 1, publish: 1 });
});

test('every mutation writes an audit row', async () => {
  // Start now (content.week.start).
  fake([{ json: proposals }]);
  assert.equal((await startNow(post('/weeks'), undefined)).status, 200);

  // A week stuck in proposing, far from today: propose → direction → edit / regenerate / skip a day → validate.
  const week = await createContentWeek(prisma, { status: 'proposing' });
  const monday = week.startsOn.toISOString().slice(0, 10);
  const plan = plannedDays(monday, monday, DEFAULT_POSTING_DAYS, ['linkedin', 'tiktok']);
  const titles = {
    days: plan.map((d, i) => ({
      date: d.date,
      topic: `Sujet ${d.date}`,
      angle: `Angle ${i}`,
      format: 'text',
      pillar: i === 0 ? 'light' : 'value',
      platforms: d.platforms.map((platform) => ({ platform, language: i < 2 ? 'en' : 'fr' })),
      sources: [],
    })),
  };
  fake([{ json: proposals }, { json: titles }, { json: titles }]);
  assert.equal((await propose(post(`/weeks/${week.id}/propose`), ctx(week.id))).status, 200);
  const chosen = await direction(post(`/weeks/${week.id}/direction`, { proposal_index: 0, refinement: 'Plus concret', platform_angles: {} }), ctx(week.id));
  assert.equal(chosen.status, 200);
  const slots = (await chosen.json()).week.slots as Array<{ id: string }>;
  assert.equal(slots.length, 6, 'one line per posting day: nothing posts on Saturday');
  assert.equal((await patchSlot(patch(`/slots/${slots[3]!.id}`, { topic: 'Un autre sujet' }), ctx(slots[3]!.id))).status, 200);
  assert.equal((await regenerateSlot(post(`/slots/${slots[4]!.id}/regenerate`), ctx(slots[4]!.id))).status, 200);
  assert.equal((await skipSlot(post(`/slots/${slots[5]!.id}/skip`, { reason: 'Jour férié' }), ctx(slots[5]!.id))).status, 200);
  assert.equal((await validate(post(`/weeks/${week.id}/validate`), ctx(week.id))).status, 200);

  const rows = await prisma.auditLog.findMany();
  assert.deepEqual(
    rows.map((r) => r.kind).sort(),
    [
      'content.week.start',
      'content.week.propose',
      'content.week.direction',
      'content.slot.update',
      'content.slot.regenerate',
      'content.slot.skip',
      'content.week.validate',
    ].sort(),
  );
  for (const r of rows) {
    assert.equal(r.actorId, adminId);
    assert.equal(r.actorRole, 'admin');
  }
});
