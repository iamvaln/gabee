import '../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@gabee/db';
import { createContentDraft, createContentSlot, createContentWeek, createMediaAsset, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import type { AiTask } from '@gabee/types';
import { setErrorReporterForTests } from '../report-error';
import { HttpError } from '../http';
import { setStorage, resetStorage } from '../storage';
import { MemoryStorage } from '../storage/memory';
import { FakeAiAdapter, resetAiAdapters, setAiAdapters, type AiAdapter, type FakeAiStep } from '../ai/router';
import type { Actor } from './state';
import { approveDraft, editDraft, generateDraftsForDay, markPublished, regenerateDraft, todayBoard } from './drafts';
import { updateSlot } from './weeks';

const prisma = createTestClient();
const actor: Actor = { id: randomUUID(), role: 'admin' };
let reported: Array<{ err: unknown; scope: string; extra: Record<string, unknown> }> = [];

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  reported = [];
  setErrorReporterForTests((err, hint) => reported.push({ err, scope: hint.tags.scope, extra: hint.extra }));
  setStorage(new MemoryStorage());
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  resetAiAdapters();
  resetStorage();
  setErrorReporterForTests(null);
  mock.restoreAll();
});
after(async () => prisma.$disconnect());

const linkedinPost = { body: 'Votre enfant compte en jouant.', hashtags: ['#Gabee', '#Parents', '#Maths'], link_target: 'landing' as const };
const tiktokPlan = {
  caption: 'Une minute de calcul. Lien en bio !',
  hashtags: ['#Gabee', '#Parents', '#Maths'],
  on_screen_text: ['3 + 4 ?'],
  mode: 'filming_plan',
  filming_plan: { hook: "L'écran du jeu", shots: ['Écran du module Nombres'], duration_s: 20 },
};
const art = { media_asset_id: null, visual_brief: 'Un enfant devant la tablette' };

/** One scripted FakeAiAdapter per task, so concurrent runs get the right reply whatever their order. */
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

const DAY = '2026-10-28';

async function fixture(weekStatus = 'validated') {
  const week = await createContentWeek(prisma, {
    startsOn: new Date('2026-10-26'),
    firstDay: new Date('2026-10-26'),
    status: weekStatus,
    proposals: { proposals: [0, 1, 2].map((i) => ({ title: `D${i}`, rationale: 'r', evidence: [], sample_angles: [] })) },
    chosenIndex: 0,
    refinement: '',
  });
  const slot = await createContentSlot(prisma, week.id, {
    date: new Date(DAY),
    topic: 'Compter les courses',
    platforms: [
      { platform: 'linkedin', language: 'en' },
      { platform: 'tiktok', language: 'fr' },
    ],
    status: 'validated',
  });
  return { week, slot };
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

const isHttp = (status: number, code: string) => (err: unknown) => err instanceof HttpError && err.status === status && err.code === code;

test('generateDraftsForDay writes one ready draft per platform with its tracked link', async () => {
  const { slot } = await fixture();
  const adapter = byTask({ post_linkedin: [{ json: linkedinPost }], post_tiktok: [{ json: tiktokPlan }], art_direction: [{ json: art }, { json: art }] });

  assert.deepEqual(await generateDraftsForDay(DAY, 'scheduled_job'), { created: 2, failed: 0 });

  const drafts = await prisma.contentDraft.findMany({ where: { slotId: slot.id }, include: { currentVersion: true } });
  const li = drafts.find((d) => d.platform === 'linkedin')!;
  const tt = drafts.find((d) => d.platform === 'tiktok')!;
  assert.equal(li.status, 'ready');
  assert.equal(li.language, 'en');
  assert.equal(li.trackedUrl, `https://gabee.app/en?utm_source=linkedin&utm_medium=social&utm_campaign=2026-10-26&utm_content=${li.id}`);
  assert.equal((li.currentVersion!.payload as { body: string }).body, `${linkedinPost.body}\n\n${li.trackedUrl}`);
  assert.equal(li.currentVersion!.source, 'agent');
  assert.equal(li.currentVersion!.n, 1);
  assert.ok(li.currentVersion!.agentVersionId);
  assert.equal(li.generationLockUntil, null);
  assert.equal(tt.status, 'ready');
  assert.equal(tt.trackedUrl, 'https://gabee.app/fr?utm_source=tiktok&utm_medium=social&utm_content=bio');
  assert.equal((tt.currentVersion!.payload as { caption: string }).caption, tiktokPlan.caption);
  assert.equal(tt.mediaAssetId, null);
  assert.equal((await prisma.contentSlot.findUniqueOrThrow({ where: { id: slot.id } })).status, 'drafted');

  // Idempotent: a second run generates nothing.
  assert.deepEqual(await generateDraftsForDay(DAY, 'scheduled_job'), { created: 0, failed: 0 });
  assert.equal(adapter.byTask.post_linkedin!.calls.length, 1);
  assert.equal(await prisma.auditLog.count(), 0, 'scheduled origin writes no audit row');
});

test('generateDraftsForDay is idempotent and single-flight per draft', async () => {
  const { slot } = await fixture();
  byTask({ post_linkedin: [{ json: linkedinPost }], post_tiktok: [{ json: tiktokPlan }], art_direction: [{ json: art }, { json: art }] });

  const results = await Promise.all([generateDraftsForDay(DAY, 'scheduled_job'), generateDraftsForDay(DAY, 'scheduled_job')]);
  assert.equal(results.reduce((n, r) => n + r.created, 0), 2);
  assert.equal(results.reduce((n, r) => n + r.failed, 0), 0);

  const drafts = await prisma.contentDraft.findMany({ where: { slotId: slot.id } });
  assert.equal(drafts.length, 2);
  assert.ok(drafts.every((d) => d.status === 'ready'));
  const runs = await prisma.agentRun.groupBy({ by: ['agentKey'], _count: true, orderBy: { agentKey: 'asc' } });
  assert.deepEqual(
    runs.map((r) => [r.agentKey, r._count]),
    [
      ['art_director', 2],
      ['writer_linkedin', 1],
      ['writer_tiktok', 1],
    ],
  );
  assert.equal(await prisma.contentDraftVersion.count(), 2);
});

test('generateDraftsForDay does nothing before the week is validated', async () => {
  await fixture('titles_ready');
  assert.deepEqual(await generateDraftsForDay(DAY, 'scheduled_job'), { created: 0, failed: 0 });
  assert.equal(await prisma.contentDraft.count(), 0);
});

test('a refused draft is marked failed with a plain reason and reported once', async () => {
  const { slot } = await fixture();
  byTask({ post_linkedin: [{ error: 'refusal' }], post_tiktok: [{ json: tiktokPlan }], art_direction: [{ json: art }] });

  assert.deepEqual(await generateDraftsForDay(DAY, 'scheduled_job'), { created: 1, failed: 1 });
  const li = await prisma.contentDraft.findUniqueOrThrow({ where: { slotId_platform: { slotId: slot.id, platform: 'linkedin' } } });
  assert.equal(li.status, 'failed');
  assert.equal(li.error, "L'IA a refusé de rédiger ce post.");
  assert.equal(li.generationLockUntil, null);
  const drafts = reported.filter((r) => r.scope === 'content.drafts');
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]!.extra.draftId, li.id);
  assert.equal((await prisma.contentSlot.findUniqueOrThrow({ where: { id: slot.id } })).status, 'drafted');
});

test('an unavailable AI marks the draft failed without a second report', async () => {
  const { slot } = await fixture();
  const outages: FakeAiStep[] = Array.from({ length: 6 }, () => ({ error: 'outage' as const }));
  byTask({ post_linkedin: outages, post_tiktok: [{ json: tiktokPlan }], art_direction: [{ json: art }] });

  assert.deepEqual(await generateDraftsForDay(DAY, 'scheduled_job'), { created: 1, failed: 1 });
  const li = await prisma.contentDraft.findUniqueOrThrow({ where: { slotId_platform: { slotId: slot.id, platform: 'linkedin' } } });
  assert.equal(li.error, "Le service d'IA est indisponible pour le moment.");
  assert.equal(reported.filter((r) => r.scope === 'content.drafts').length, 0);
  assert.equal(reported.filter((r) => r.scope === 'ai.router').length, 1);
});

test('a generation holds its draft for 20 minutes (180 s × 2 SDK attempts, + the runAgent retry)', async () => {
  const { slot } = await fixture();
  const adapter = byTask({ post_linkedin: [{ json: linkedinPost }], post_tiktok: [{ json: tiktokPlan }], art_direction: [{ json: art }, { json: art }] });
  const heldFor: number[] = [];
  const inner = adapter.call.bind(adapter);
  adapter.call = async (...args: Parameters<AiAdapter['call']>) => {
    if (args[2].task === 'post_linkedin') {
      const d = await prisma.contentDraft.findFirstOrThrow({ where: { slotId: slot.id, platform: 'linkedin' } });
      heldFor.push(d.generationLockUntil!.getTime() - Date.now());
    }
    return inner(...args);
  };
  assert.deepEqual(await generateDraftsForDay(DAY, 'scheduled_job'), { created: 2, failed: 0 });
  assert.equal(heldFor.length, 1);
  assert.ok(heldFor[0]! > 19 * 60_000 && heldFor[0]! <= 20 * 60_000, `lock held ${heldFor[0]} ms`);
});

test('regenerateDraft refuses while a generation holds the lock, then regenerates', async () => {
  const { slot } = await fixture();
  const draft = await readyDraft(slot.id, 'linkedin', { generationLockUntil: new Date(Date.now() + 60_000) });
  await assert.rejects(regenerateDraft(draft.id, actor), isHttp(409, 'generation_in_progress'));

  await prisma.contentDraft.update({ where: { id: draft.id }, data: { generationLockUntil: new Date(Date.now() - 1000) } });
  byTask({ post_linkedin: [{ json: { ...linkedinPost, body: 'Nouvelle version.' } }], art_direction: [{ json: art }] });
  const dto = await regenerateDraft(draft.id, actor);
  assert.equal(dto.status, 'ready');
  assert.equal(dto.version?.n, 2);
  assert.match((dto.payload as { body: string }).body, /^Nouvelle version\.\n\nhttps:\/\/gabee\.app\/en\?/);
  assert.equal(await prisma.auditLog.count({ where: { kind: 'content.draft.regenerate' } }), 1);

  const published = await readyDraft(slot.id, 'tiktok', { status: 'published' });
  await assert.rejects(regenerateDraft(published.id, actor), isHttp(409, 'invalid_transition'));
});

test('editDraft re-validates the post without the tracked link, then re-appends it', async () => {
  const { slot } = await fixture();
  const draft = await readyDraft(slot.id, 'linkedin', { status: 'approved' });
  await prisma.contentDraft.update({ where: { id: draft.id }, data: { approvedVersionId: draft.currentVersionId } });

  // The UI sends the body as shown, link included.
  const dto = await editDraft(draft.id, { body: `Texte du propriétaire.\n\n${draft.trackedUrl}`, hashtags: ['#Gabee', '#Parents', '#Maths'] }, actor);
  assert.equal(dto.status, 'ready');
  assert.equal(dto.approved_version_id, null);
  assert.equal(dto.version?.source, 'owner');
  assert.equal((dto.payload as { body: string }).body, `Texte du propriétaire.\n\n${draft.trackedUrl}`);
  const version = await prisma.contentDraftVersion.findFirstOrThrow({ where: { draftId: draft.id, n: 2 } });
  assert.equal(version.editedById, actor.id);

  await assert.rejects(editDraft(draft.id, { body: 'Voir https://example.com' }, actor), isHttp(422, 'invalid_post'));
  await assert.rejects(editDraft(draft.id, { hashtags: [] }, actor), isHttp(422, 'invalid_post'));
  await assert.rejects(editDraft(draft.id, { media_asset_id: randomUUID() }, actor), isHttp(422, 'media_not_found'));
  assert.equal(await prisma.auditLog.count({ where: { kind: 'content.draft.edit' } }), 1);
});

test('tiktok approval requires a cleared video', async () => {
  const { slot } = await fixture();
  const draft = await readyDraft(slot.id, 'tiktok');
  await assert.rejects(approveDraft(draft.id, actor), isHttp(409, 'video_required'));

  const uncleared = await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '9:16', cleared: false });
  await prisma.contentDraft.update({ where: { id: draft.id }, data: { mediaAssetId: uncleared.id } });
  await assert.rejects(approveDraft(draft.id, actor), isHttp(409, 'video_required'));

  const image = await createMediaAsset(prisma, { kind: 'image', aspect: '9:16', cleared: true });
  await prisma.contentDraft.update({ where: { id: draft.id }, data: { mediaAssetId: image.id } });
  await assert.rejects(approveDraft(draft.id, actor), isHttp(409, 'video_required'));

  const video = await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '9:16', cleared: true });
  await editDraft(draft.id, { media_asset_id: video.id }, actor);
  const approved = await approveDraft(draft.id, actor);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approved_version_id, approved.version?.id);
  assert.deepEqual(approved.media, { id: video.id, kind: 'video', file_name: video.fileName, cleared: true, aspect: '9:16' });
  assert.equal(await prisma.auditLog.count({ where: { kind: 'content.draft.approve' } }), 1);
});

test('linkedin approval accepts text only but refuses an uncleared media', async () => {
  const { slot } = await fixture();
  const image = await createMediaAsset(prisma, { cleared: false });
  const withMedia = await readyDraft(slot.id, 'linkedin', { mediaAssetId: image.id });
  await assert.rejects(approveDraft(withMedia.id, actor), isHttp(409, 'media_not_cleared'));
  await editDraft(withMedia.id, { media_asset_id: null }, actor);
  assert.equal((await approveDraft(withMedia.id, actor)).status, 'approved');
});

test('editDraft attaches only a ready file that fits the platform', async () => {
  const { slot } = await fixture();
  const tiktok = await readyDraft(slot.id, 'tiktok');
  const linkedin = await readyDraft(slot.id, 'linkedin');

  // A TikTok post is a video: an image is refused, whatever its clearance.
  const image = await createMediaAsset(prisma, { kind: 'image', aspect: '9:16', cleared: true });
  await assert.rejects(editDraft(tiktok.id, { media_asset_id: image.id }, actor), isHttp(422, 'media_kind_mismatch'));
  // An upload that never completed, or was rejected, is not a usable file.
  for (const status of ['pending', 'verifying', 'rejected']) {
    const video = await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '9:16', status });
    await assert.rejects(editDraft(tiktok.id, { media_asset_id: video.id }, actor), isHttp(422, 'media_not_ready'));
  }
  const unchanged = await prisma.contentDraft.findUniqueOrThrow({ where: { id: tiktok.id } });
  assert.equal(unchanged.mediaAssetId, null);
  assert.equal(await prisma.contentDraftVersion.count({ where: { draftId: tiktok.id } }), 1, 'a refused attach writes no version');

  // Ruling 16: the aspect must fit too. TikTok: vertical only.
  const wide = await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '16:9', cleared: true });
  await assert.rejects(editDraft(tiktok.id, { media_asset_id: wide.id }, actor), (e: unknown) => isHttp(422, 'media_aspect_mismatch')(e) && /9:16/.test((e as Error).message));
  // LinkedIn: no vertical file, and a video needs a known aspect.
  const vertical = await createMediaAsset(prisma, { kind: 'image', aspect: '9:16', cleared: true });
  await assert.rejects(editDraft(linkedin.id, { media_asset_id: vertical.id }, actor), (e: unknown) => isHttp(422, 'media_aspect_mismatch')(e) && /16:9, 1:1 ou 4:5/.test((e as Error).message));
  const unknownVideo = await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: null, cleared: true });
  await assert.rejects(editDraft(linkedin.id, { media_asset_id: unknownVideo.id }, actor), isHttp(422, 'media_aspect_mismatch'));

  // An uncleared video may be attached (approval waits for its clearance); LinkedIn takes images and videos.
  const video = await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '9:16', cleared: false });
  assert.equal((await editDraft(tiktok.id, { media_asset_id: video.id }, actor)).media?.id, video.id);
  const portrait = await createMediaAsset(prisma, { kind: 'image', aspect: '4:5', cleared: true });
  assert.equal((await editDraft(linkedin.id, { media_asset_id: portrait.id }, actor)).media?.id, portrait.id);
  const square = await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '1:1', cleared: true });
  assert.equal((await editDraft(linkedin.id, { media_asset_id: square.id }, actor)).media?.id, square.id);
  const unknownImage = await createMediaAsset(prisma, { kind: 'image', aspect: null, width: null, height: null, cleared: true });
  assert.equal((await editDraft(linkedin.id, { media_asset_id: unknownImage.id }, actor)).media?.id, unknownImage.id);
});

test('approval refuses a file that does not fit the platform', async () => {
  const { slot } = await fixture();
  const tiktok = await readyDraft(slot.id, 'tiktok');
  const linkedin = await readyDraft(slot.id, 'linkedin');
  // Attached before the rule existed (or by hand): approval re-checks it.
  const wide = await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '16:9', cleared: true });
  await prisma.contentDraft.update({ where: { id: tiktok.id }, data: { mediaAssetId: wide.id } });
  await assert.rejects(approveDraft(tiktok.id, actor), isHttp(409, 'media_aspect_mismatch'));
  const vertical = await createMediaAsset(prisma, { kind: 'image', aspect: '9:16', cleared: true });
  await prisma.contentDraft.update({ where: { id: linkedin.id }, data: { mediaAssetId: vertical.id } });
  await assert.rejects(approveDraft(linkedin.id, actor), isHttp(409, 'media_aspect_mismatch'));
  assert.equal(await prisma.contentDraft.count({ where: { status: 'approved' } }), 0);
});

test('markPublished closes the slot when every draft is published', async () => {
  const { slot } = await fixture();
  await prisma.contentSlot.update({ where: { id: slot.id }, data: { status: 'drafted' } });
  const li = await readyDraft(slot.id, 'linkedin', { status: 'approved' });
  const tt = await readyDraft(slot.id, 'tiktok', { status: 'approved' });

  await markPublished(li.id, { post_url: 'https://www.linkedin.com/feed/1' }, actor);
  assert.equal((await prisma.contentSlot.findUniqueOrThrow({ where: { id: slot.id } })).status, 'drafted');
  await assert.rejects(markPublished(li.id, { post_url: 'https://www.linkedin.com/feed/2' }, actor), isHttp(409, 'invalid_transition'));

  const dto = await markPublished(tt.id, { post_url: 'https://www.tiktok.com/@gabee/video/1', rating: 4, comment: 'Bien' }, actor);
  assert.equal(dto.status, 'published');
  assert.equal(dto.publication?.post_url, 'https://www.tiktok.com/@gabee/video/1');
  assert.equal(dto.publication?.rating, 4);
  assert.equal((await prisma.contentSlot.findUniqueOrThrow({ where: { id: slot.id } })).status, 'done');
  assert.equal(await prisma.contentPublication.count(), 2);
  assert.equal(await prisma.auditLog.count({ where: { kind: 'content.draft.publish' } }), 2);
});

test('a draft generated while its slot is edited lands stale', async () => {
  const { slot } = await fixture();
  const adapter = byTask({ post_linkedin: [{ json: linkedinPost }], post_tiktok: [{ json: tiktokPlan }], art_direction: [{ json: art }, { json: art }] });
  // Hold the LinkedIn writer until the owner has edited the day.
  let reached!: () => void;
  const atWriter = new Promise<void>((r) => (reached = r));
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const writer = adapter.byTask.post_linkedin!;
  const call = writer.call.bind(writer);
  writer.call = async (...args) => {
    reached();
    await gate;
    return call(...args);
  };

  const run = generateDraftsForDay(DAY, 'scheduled_job');
  await atWriter;
  await updateSlot(slot.id, { topic: 'Sujet modifié pendant la génération' }, actor);
  release();
  assert.deepEqual(await run, { created: 2, failed: 0 });

  const drafts = await prisma.contentDraft.findMany({ where: { slotId: slot.id } });
  // LinkedIn was written on the old topic; TikTok started after the edit.
  assert.equal(drafts.find((d) => d.platform === 'linkedin')!.status, 'stale');
  assert.equal(drafts.find((d) => d.platform === 'tiktok')!.status, 'ready');
  assert.ok(drafts.every((d) => d.currentVersionId && d.generationLockUntil === null));
});

test('todayBoard returns the day slot and yesterday’s unpublished drafts', async () => {
  const { week, slot } = await fixture();
  const today = await readyDraft(slot.id, 'linkedin');
  const yesterday = await createContentSlot(prisma, week.id, { date: new Date('2026-10-27'), status: 'drafted' });
  const pending = await readyDraft(yesterday.id, 'linkedin', { status: 'approved' });
  await readyDraft(yesterday.id, 'tiktok', { status: 'published' });

  const board = await todayBoard(DAY);
  assert.equal(board.day, DAY);
  assert.equal(board.week_status, 'validated');
  assert.equal(board.slot?.id, slot.id);
  assert.deepEqual(board.slot?.drafts.map((d) => d.id), [today.id]);
  assert.equal(board.slot?.drafts[0]!.tracked_url, today.trackedUrl);
  assert.equal(board.yesterday?.id, yesterday.id);
  assert.deepEqual(board.yesterday?.drafts.map((d) => d.id), [pending.id]);

  await prisma.contentSlot.update({ where: { id: yesterday.id }, data: { status: 'skipped', skipReason: 'off' } });
  assert.equal((await todayBoard(DAY)).yesterday, null);
  const empty = await todayBoard('2026-12-01');
  assert.equal(empty.slot, null);
  assert.equal(empty.week_status, null);
});
