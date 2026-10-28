import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestClient,
  resetDb,
  createParent,
  createChild,
  createCurriculum,
  createQuestion,
  createDevice,
  createContentWeek,
  createContentSlot,
  createContentDraft,
  createMediaAsset,
  seedContentStudio,
} from '../src/testing';
import { AGENT_KEYS } from '@gabee/types';
import { loadAgentInstructions } from '../prisma/seed-content-studio';

const prisma = createTestClient();

before(async () => {
  await resetDb(prisma);
});
beforeEach(async () => {
  await resetDb(prisma);
});
after(async () => {
  await prisma.$disconnect();
});

test('createParent → unique emails, default parent role', async () => {
  const a = await createParent(prisma);
  const b = await createParent(prisma);
  assert.notEqual(a.email, b.email);
  assert.equal(a.role, 'parent');
});

test('createChild auto-creates a parent and links to it', async () => {
  const child = await createChild(prisma);
  const found = await prisma.childProfile.findUniqueOrThrow({
    where: { id: child.id },
    include: { parent: true },
  });
  assert.equal(found.parent.id, child.parentId);
  assert.equal(found.language, 'fr');
});

test('createChild respects an explicit parentId', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  assert.equal(child.parentId, parent.id);
});

test('createQuestion auto-creates a curriculum; overrides win', async () => {
  const q = await createQuestion(prisma, { module: 'words', level: 3 });
  assert.equal(q.module, 'words');
  assert.equal(q.level, 3);
  const cur = await prisma.curriculum.findUniqueOrThrow({ where: { id: q.curriculumId } });
  assert.ok(cur.id);
});

test('createDevice auto-creates a parent', async () => {
  const device = await createDevice(prisma);
  const parent = await prisma.parentAccount.findUniqueOrThrow({ where: { id: device.parentId } });
  assert.ok(parent.id);
});

test('createCurriculum creates a row', async () => {
  const cur = await createCurriculum(prisma);
  assert.equal(await prisma.curriculum.count({ where: { id: cur.id } }), 1);
});

test('resetDb truncates everything except _prisma_migrations', async () => {
  await createChild(prisma);
  await createQuestion(prisma);
  await resetDb(prisma);
  assert.equal(await prisma.parentAccount.count(), 0);
  assert.equal(await prisma.childProfile.count(), 0);
  assert.equal(await prisma.question.count(), 0);
  // migrations table untouched — the client still works against a migrated schema
  const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM _prisma_migrations
  `;
  assert.ok(count > 0n);
});

test('seedContentStudio is idempotent and never overwrites admin edits', async () => {
  await seedContentStudio(prisma);
  const counts = async () => ({
    settings: await prisma.studioSettings.count(),
    models: await prisma.aiModel.count(),
    routes: await prisma.aiTaskRoute.count(),
    profiles: await prisma.platformProfile.count(),
    lines: await prisma.editorialLineVersion.count(),
    agents: await prisma.agent.count(),
    versions: await prisma.agentVersion.count(),
  });
  const first = await counts();
  assert.deepEqual(first, { settings: 1, models: 3, routes: 6, profiles: 2, lines: 1, agents: 5, versions: 5 });

  // A super-admin edits a price, a route and publishes an agent v2.
  await prisma.aiModel.update({ where: { key: 'claude-opus-5-5' }, data: { inputUsdPerMTok: 9 } });
  await prisma.aiTaskRoute.update({
    where: { task_rank: { task: 'post_tiktok', rank: 1 } },
    data: { modelKey: 'claude-sonnet-5-5' },
  });
  const v2 = await prisma.agentVersion.create({
    data: { agentKey: 'strategist', version: 2, instructions: 'edited', publishedAt: new Date(), source: 'owner' },
  });
  await prisma.agent.update({ where: { key: 'strategist' }, data: { publishedVersionId: v2.id } });

  await seedContentStudio(prisma);
  assert.deepEqual(await counts(), { ...first, versions: 6 });
  const opus = await prisma.aiModel.findUniqueOrThrow({ where: { key: 'claude-opus-5-5' } });
  assert.equal(opus.inputUsdPerMTok, 9);
  const route = await prisma.aiTaskRoute.findUniqueOrThrow({ where: { task_rank: { task: 'post_tiktok', rank: 1 } } });
  assert.equal(route.modelKey, 'claude-sonnet-5-5');
  const strategist = await prisma.agent.findUniqueOrThrow({ where: { key: 'strategist' } });
  assert.equal(strategist.publishedVersionId, v2.id);
  const writer = await prisma.agent.findUniqueOrThrow({
    where: { key: 'writer_tiktok' },
    include: { publishedVersion: true },
  });
  assert.equal(writer.publishedVersion?.version, 1);
  assert.match(writer.publishedVersion?.instructions ?? '', /TikTok/);
});

// ── Seed upgrade path: the only way changed agent instruction files reach prod ──

/** What prod holds before an instruction file changes: every agent at a seed v1 written from an older file. */
async function seedWithOlderFiles(): Promise<void> {
  await seedContentStudio(prisma);
  await prisma.agentVersion.updateMany({ where: { version: 1 }, data: { instructions: 'Instructions from an older file.' } });
}

const published = (key: string) =>
  prisma.agent.findUniqueOrThrow({ where: { key }, include: { publishedVersion: true } }).then((a) => a.publishedVersion);

test('seedContentStudio publishes v2 from the file for a seed version that differs, keeping v1 as history', async () => {
  await seedWithOlderFiles();
  await seedContentStudio(prisma);

  for (const key of AGENT_KEYS) {
    const live = await published(key);
    assert.equal(live?.version, 2, key);
    assert.equal(live?.source, 'seed', key);
    assert.equal(live?.instructions, loadAgentInstructions(key), key);
    assert.ok(live?.publishedAt, key);
    const v1 = await prisma.agentVersion.findUniqueOrThrow({ where: { agentKey_version: { agentKey: key, version: 1 } } });
    assert.equal(v1.instructions, 'Instructions from an older file.', `${key} v1 is kept as it was`);
  }
  assert.equal(await prisma.agentVersion.count(), AGENT_KEYS.length * 2);
});

test('seedContentStudio upgrades idempotently: a second run changes nothing', async () => {
  await seedWithOlderFiles();
  await seedContentStudio(prisma);
  const snapshot = async () =>
    (await prisma.agentVersion.findMany({ orderBy: [{ agentKey: 'asc' }, { version: 'asc' }] })).map((v) => [v.id, v.agentKey, v.version, v.publishedAt?.toISOString()]);
  const before = await snapshot();
  const pointers = await prisma.agent.findMany({ orderBy: { key: 'asc' }, select: { key: true, publishedVersionId: true } });

  await seedContentStudio(prisma);
  await seedContentStudio(prisma);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await prisma.agent.findMany({ orderBy: { key: 'asc' }, select: { key: true, publishedVersionId: true } }), pointers);
});

test('seedContentStudio never replaces an owner version, published or pointed at', async () => {
  await seedWithOlderFiles();
  // The owner published their own strategist v2.
  const owner = await prisma.agentVersion.create({
    data: { agentKey: 'strategist', version: 2, instructions: 'Owner instructions.', publishedAt: new Date(), source: 'owner' },
  });
  await prisma.agent.update({ where: { key: 'strategist' }, data: { publishedVersionId: owner.id } });
  // The owner rolled the analyst back to an older seed version: the live pointer is theirs to choose.
  const analystV2 = await prisma.agentVersion.create({
    data: { agentKey: 'analyst', version: 2, instructions: 'Seed text the owner rolled back from.', publishedAt: new Date(), source: 'seed' },
  });
  const analystV1 = await prisma.agentVersion.findUniqueOrThrow({ where: { agentKey_version: { agentKey: 'analyst', version: 1 } } });
  assert.notEqual(analystV2.id, analystV1.id);

  await seedContentStudio(prisma);

  const strategist = await published('strategist');
  assert.equal(strategist?.id, owner.id);
  assert.equal(await prisma.agentVersion.count({ where: { agentKey: 'strategist' } }), 2, 'no seed version above the owner one');
  const analyst = await published('analyst');
  assert.equal(analyst?.id, analystV1.id, 'the rollback stands');
  assert.equal(await prisma.agentVersion.count({ where: { agentKey: 'analyst' } }), 2);
  // Agents the owner never touched are upgraded.
  assert.equal((await published('writer_linkedin'))?.version, 2);
});

test('a version written without a source is the owner\'s: the seed never replaces it', async () => {
  await seedWithOlderFiles();
  assert.deepEqual([...new Set((await prisma.agentVersion.findMany()).map((v) => v.source))], ['seed'], 'the seed writes its source');
  const unnamed = await prisma.agentVersion.create({ data: { agentKey: 'strategist', version: 2, instructions: 'Written by hand.', publishedAt: new Date() } });
  assert.equal(unnamed.source, 'owner');
  await prisma.agent.update({ where: { key: 'strategist' }, data: { publishedVersionId: unnamed.id } });
  await seedContentStudio(prisma);
  assert.equal((await published('strategist'))?.id, unnamed.id);
});

test('seedContentStudio upgrades above an unpublished owner draft (next free version number)', async () => {
  await seedWithOlderFiles();
  await prisma.agentVersion.create({ data: { agentKey: 'writer_tiktok', version: 2, instructions: 'Owner draft, not published.', source: 'owner' } });

  await seedContentStudio(prisma);

  const live = await published('writer_tiktok');
  assert.equal(live?.version, 3);
  assert.equal(live?.source, 'seed');
  assert.equal(live?.instructions, loadAgentInstructions('writer_tiktok'));
  const draft = await prisma.agentVersion.findUniqueOrThrow({ where: { agentKey_version: { agentKey: 'writer_tiktok', version: 2 } } });
  assert.equal(draft.publishedAt, null, 'the owner draft stays a draft');
});

test('content studio factories build a week → slot → draft with media', async () => {
  const week = await createContentWeek(prisma);
  const other = await createContentWeek(prisma);
  assert.notEqual(week.startsOn.getTime(), other.startsOn.getTime());
  const day1 = await createContentSlot(prisma, week.id);
  const day2 = await createContentSlot(prisma, week.id);
  assert.equal(day2.date.getTime() - day1.date.getTime(), 24 * 60 * 60 * 1000);
  const media = await createMediaAsset(prisma, { kind: 'video', mime: 'video/mp4', aspect: '9:16', cleared: true });
  const draft = await createContentDraft(prisma, day1.id, { platform: 'tiktok', mediaAssetId: media.id });
  const loaded = await prisma.contentDraft.findUniqueOrThrow({
    where: { id: draft.id },
    include: { slot: { include: { week: true } }, mediaAsset: true },
  });
  assert.equal(loaded.slot.week.id, week.id);
  assert.equal(loaded.mediaAsset?.cleared, true);
  // A media file in use cannot be deleted from the library.
  await assert.rejects(prisma.mediaAsset.delete({ where: { id: media.id } }));
});

