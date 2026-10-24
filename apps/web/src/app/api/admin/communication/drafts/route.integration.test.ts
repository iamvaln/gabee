import '../../../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { Prisma } from '@gabee/db';
import { createContentDraft, createContentSlot, createContentWeek, createMediaAsset, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import type { AiTask } from '@gabee/types';
import { createLoginableParent } from '@/test/factories';
import { adminCookie, parentCookie, parentToken, webRequest } from '@/test/auth';
import { setErrorReporterForTests } from '@/lib/server/report-error';
import { resetAiAdapters, setAiAdapters, type AiAdapter } from '@/lib/server/ai/router';
import { FakeAiAdapter, type FakeAiStep } from '@/lib/server/ai/router/fake-adapter';
import { MemoryStorage } from '@/lib/server/storage/memory';
import { resetStorage, setStorage } from '@/lib/server/storage';
import { PATCH as edit } from './[id]/route';
import { POST as regenerate } from './[id]/regenerate/route';
import { POST as approve } from './[id]/approve/route';
import { POST as publish } from './[id]/publish/route';
import { GET as media } from './[id]/media/route';

const prisma = createTestClient();
const U = 'http://localhost/api/admin/communication/drafts';
let cookie: { name: string; value: string };
let adminId: string;
let reported: unknown[] = [];

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  setStorage(new MemoryStorage());
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  adminId = parent.id;
  cookie = adminCookie(await parentToken(parent.id, parent.email));
  reported = [];
  setErrorReporterForTests((err) => reported.push(err));
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  resetAiAdapters();
  resetStorage();
  setErrorReporterForTests(null);
  mock.restoreAll();
});
after(() => prisma.$disconnect());

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (path: string, body?: unknown, c = cookie) => webRequest(`${U}${path}`, { cookie: c, ...(body !== undefined ? { body } : {}) });

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

const DAY = '2026-10-28';
const linkedinPost = { body: 'Votre enfant compte en jouant.', hashtags: ['#Gabee', '#Parents', '#Maths'], link_target: 'landing' as const };
const tiktokPlan = {
  caption: 'Une minute de calcul. Lien en bio !',
  hashtags: ['#Gabee', '#Parents', '#Maths'],
  on_screen_text: ['3 + 4 ?'],
  mode: 'filming_plan',
  filming_plan: { hook: "L'écran du jeu", shots: ['Écran du module Nombres'], duration_s: 20 },
};

async function fixture(platforms: Array<{ platform: 'linkedin' | 'tiktok'; language: 'fr' | 'en' }> = [{ platform: 'linkedin', language: 'en' }]) {
  const week = await createContentWeek(prisma, {
    startsOn: new Date('2026-10-26'),
    firstDay: new Date('2026-10-26'),
    status: 'validated',
    proposals: { proposals: [0, 1, 2].map((i) => ({ title: `D${i}`, rationale: 'r', evidence: [], sample_angles: [] })) },
    chosenIndex: 0,
    refinement: '',
  });
  return createContentSlot(prisma, week.id, { date: new Date(DAY), topic: 'Compter les courses à 5 ans !', platforms, status: 'drafted' });
}

/** A ready draft with one agent version. */
async function readyDraft(slotId: string, platform: 'linkedin' | 'tiktok', overrides: Partial<Prisma.ContentDraftUncheckedCreateInput> = {}) {
  const trackedUrl =
    platform === 'linkedin'
      ? 'https://gabee.app/en?utm_source=linkedin&utm_medium=social&utm_campaign=2026-10-26&utm_content=x'
      : 'https://gabee.app/fr?utm_source=tiktok&utm_medium=social&utm_content=bio';
  const draft = await createContentDraft(prisma, slotId, { platform, language: platform === 'linkedin' ? 'en' : 'fr', status: 'ready', trackedUrl, ...overrides });
  const payload = platform === 'linkedin' ? { ...linkedinPost, body: `${linkedinPost.body}\n\n${trackedUrl}` } : tiktokPlan;
  const v = await prisma.contentDraftVersion.create({ data: { draftId: draft.id, n: 1, source: 'agent', payload } });
  return prisma.contentDraft.update({ where: { id: draft.id }, data: { currentVersionId: v.id } });
}

test('admin can approve and publish; parent gets 403', async () => {
  const slot = await fixture();
  const draft = await readyDraft(slot.id, 'linkedin');
  const { parent } = await createLoginableParent(prisma, { role: 'parent' });
  const pc = parentCookie(await parentToken(parent.id, parent.email));

  assert.equal((await approve(post(`/${draft.id}/approve`, undefined, pc), ctx(draft.id))).status, 403);
  assert.equal((await publish(post(`/${draft.id}/publish`, { post_url: 'https://www.linkedin.com/feed/update/1' }, pc), ctx(draft.id))).status, 403);
  assert.equal((await approve(webRequest(`${U}/${draft.id}/approve`), ctx(draft.id))).status, 401);

  const approved = await approve(post(`/${draft.id}/approve`), ctx(draft.id));
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).draft.status, 'approved');

  const published = await publish(post(`/${draft.id}/publish`, { post_url: 'https://www.linkedin.com/feed/update/1', rating: 4 }), ctx(draft.id));
  assert.equal(published.status, 200);
  const dto = (await published.json()).draft;
  assert.equal(dto.status, 'published');
  assert.equal(dto.publication.post_url, 'https://www.linkedin.com/feed/update/1');
  assert.equal((await prisma.contentSlot.findUniqueOrThrow({ where: { id: slot.id } })).status, 'done');
});

test('approve passes the service HttpError through: TikTok without a video → 409 video_required', async () => {
  const slot = await fixture([{ platform: 'tiktok', language: 'fr' }]);
  const draft = await readyDraft(slot.id, 'tiktok');
  const res = await approve(post(`/${draft.id}/approve`), ctx(draft.id));
  assert.equal(res.status, 409);
  const { error } = await res.json();
  assert.equal(error.code, 'video_required');
  assert.match(error.message, /vidéo/);
});

test('publish validates its body (422) and edit rejects an invalid post (422 invalid_post)', async () => {
  const slot = await fixture();
  const draft = await readyDraft(slot.id, 'linkedin');
  assert.equal((await publish(post(`/${draft.id}/publish`, { post_url: 'pas une url' }), ctx(draft.id))).status, 422);
  const res = await edit(webRequest(`${U}/${draft.id}`, { method: 'PATCH', cookie, body: { hashtags: [] } }), ctx(draft.id));
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.code, 'invalid_post');
});

test('a regeneration that fails answers 200 with the draft failed and its reason, reported once', async () => {
  const slot = await fixture();
  const draft = await readyDraft(slot.id, 'linkedin');
  byTask({ post_linkedin: [{ error: 'refusal' }] });
  const res = await regenerate(post(`/${draft.id}/regenerate`), ctx(draft.id));
  assert.equal(res.status, 200);
  const dto = (await res.json()).draft;
  assert.equal(dto.status, 'failed');
  assert.match(dto.error, /refusé/);
  assert.equal(reported.length, 1);
});

test('media download is a 302 named YYYY-MM-DD-<platform>-<slug>.<ext>; storage failures map to 503', async () => {
  const slot = await fixture();
  const asset = await createMediaAsset(prisma, { fileName: 'IMG_0042.PNG', cleared: true });
  const draft = await readyDraft(slot.id, 'linkedin', { mediaAssetId: asset.id });

  const res = await media(webRequest(`${U}/${draft.id}/media`, { method: 'GET', cookie }), ctx(draft.id));
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get('location') ?? '');
  assert.equal(loc.searchParams.get('name'), '2026-10-28-linkedin-compter-les-courses-a-5-ans.png');
  assert.equal(loc.searchParams.get('ttl'), '900');

  const failing = new MemoryStorage();
  failing.presignGet = async () => {
    throw new S3ServiceException({ name: 'InternalError', $fault: 'server', $metadata: { httpStatusCode: 500 } });
  };
  setStorage(failing);
  const down = await media(webRequest(`${U}/${draft.id}/media`, { method: 'GET', cookie }), ctx(draft.id));
  assert.equal(down.status, 503);
  const { error } = await down.json();
  assert.equal(error.code, 'storage_unavailable');
  assert.match(error.message, /stockage/);
  assert.equal(reported.length, 1);

  const bare = await readyDraft((await fixture2()).id, 'linkedin');
  const none = await media(webRequest(`${U}/${bare.id}/media`, { method: 'GET', cookie }), ctx(bare.id));
  assert.equal(none.status, 404);
  assert.equal((await none.json()).error.code, 'no_media');
});

/** A second slot (next day) of the same week. */
async function fixture2() {
  const week = await prisma.contentWeek.findFirstOrThrow();
  return createContentSlot(prisma, week.id, { date: new Date('2026-10-29'), status: 'drafted', platforms: [{ platform: 'linkedin', language: 'fr' }] });
}

test('every mutation writes an audit row', async () => {
  const slot = await fixture();
  const draft = await readyDraft(slot.id, 'linkedin');
  byTask({ post_linkedin: [{ json: linkedinPost }], art_direction: [{ json: { media_asset_id: null, visual_brief: 'b' } }] });

  const edited = await edit(webRequest(`${U}/${draft.id}`, { method: 'PATCH', cookie, body: { body: 'Un texte revu par la fondatrice.' } }), ctx(draft.id));
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).draft.version.source, 'owner');
  const regenerated = await regenerate(post(`/${draft.id}/regenerate`), ctx(draft.id));
  assert.equal(regenerated.status, 200);
  assert.equal((await regenerated.json()).draft.version.n, 3);
  assert.equal((await approve(post(`/${draft.id}/approve`), ctx(draft.id))).status, 200);
  assert.equal((await publish(post(`/${draft.id}/publish`, { post_url: 'https://www.linkedin.com/feed/update/2' }), ctx(draft.id))).status, 200);

  const rows = await prisma.auditLog.findMany();
  assert.deepEqual(rows.map((r) => r.kind).sort(), ['content.draft.approve', 'content.draft.edit', 'content.draft.publish', 'content.draft.regenerate']);
  for (const r of rows) {
    assert.equal(r.actorId, adminId);
    assert.equal(r.actorRole, 'admin');
    assert.equal(r.targetId, draft.id);
  }
});
