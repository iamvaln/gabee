import '../../../test/setup-integration';
import test, { after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createMediaAsset } from '@gabee/db/testing';
import { initUpload, completeUpload, setClearance, listMedia, downloadUrl } from './media';
import { MemoryStorage } from '../storage/memory';
import { setStorage, resetStorage } from '../storage';
import { HttpError } from '../http';
import { setErrorReporterForTests } from '../report-error';

const prisma = createTestClient();
let store: MemoryStorage;
const actor = '00000000-0000-4000-8000-000000000001';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);

beforeEach(async () => {
  await resetDb(prisma);
  store = new MemoryStorage();
  setStorage(store);
});
afterEach(() => {
  resetStorage();
  setErrorReporterForTests(null);
});
after(() => prisma.$disconnect());

async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: unknown) => e instanceof HttpError && e.status === status);
}

test('initUpload rejects svg and a 301 MB video', async () => {
  await rejects(initUpload({ file_name: 'a.svg', mime: 'image/svg+xml' as never, size_bytes: 10 }, actor), 422);
  await rejects(initUpload({ file_name: 'a.mp4', mime: 'video/mp4', size_bytes: 301 * 1024 * 1024 }, actor), 422);
  assert.equal(await prisma.mediaAsset.count(), 0);
});

test('initUpload creates a pending row with a media/yyyy/mm/uuid.ext key', async () => {
  const { assetId, uploadUrl } = await initUpload({ file_name: 'Hero Shot.png', mime: 'image/png', size_bytes: PNG.length }, actor);
  assert.ok(uploadUrl);
  const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  assert.equal(row.status, 'pending');
  assert.equal(row.kind, 'image');
  assert.equal(row.cleared, false);
  assert.equal(row.uploadedById, actor);
  assert.match(row.objectKey, /^media\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
});

test('register accepts a verified upload', async () => {
  const { assetId } = await initUpload({ file_name: 'a.png', mime: 'image/png', size_bytes: PNG.length }, actor);
  const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  store.putObject(row.objectKey, PNG, 'image/png');
  const dto = await completeUpload(assetId, actor);
  assert.equal(dto.status, 'ready');
  assert.equal(dto.cleared, false);
});

test('register rejects missing object and sniffed-mime mismatch', async () => {
  const a = await initUpload({ file_name: 'a.png', mime: 'image/png', size_bytes: 16 }, actor);
  const missing = await completeUpload(a.assetId, actor);
  assert.equal(missing.status, 'rejected');
  assert.ok(missing.rejectReason);

  const b = await initUpload({ file_name: 'b.mp4', mime: 'video/mp4', size_bytes: 24 }, actor);
  const rowB = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: b.assetId } });
  store.putObject(rowB.objectKey, new TextEncoder().encode('<html>not a video</html>'.padEnd(16, ' ')), 'video/mp4');
  const bad = await completeUpload(b.assetId, actor);
  assert.equal(bad.status, 'rejected');
  assert.equal(bad.rejectReason, "Le fichier n'est pas une vidéo MP4 valide.");
  assert.equal(await store.head(rowB.objectKey), null, 'rejected object is deleted');

  const c = await initUpload({ file_name: 'c.png', mime: 'image/png', size_bytes: 99 }, actor);
  const rowC = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: c.assetId } });
  store.putObject(rowC.objectKey, PNG, 'image/png');
  assert.equal((await completeUpload(c.assetId, actor)).status, 'rejected', 'size mismatch');
  assert.equal(await store.head(rowC.objectKey), null);
});

test('completeUpload reports delete errors other than not-found', async () => {
  const reported: unknown[] = [];
  setErrorReporterForTests((e) => reported.push(e));
  const a = await initUpload({ file_name: 'a.png', mime: 'image/png', size_bytes: 16 }, actor);
  const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: a.assetId } });
  store.putObject(row.objectKey, new Uint8Array(16), 'image/png');
  store.delete = async () => {
    throw new Error('r2 down');
  };
  const dto = await completeUpload(a.assetId, actor);
  assert.equal(dto.status, 'rejected');
  assert.equal(reported.length, 1);
});

test('completeUpload on a non-pending or unknown asset is 404/409', async () => {
  await rejects(completeUpload('00000000-0000-4000-8000-0000000000ff', actor), 404);
  const ready = await createMediaAsset(prisma, { status: 'ready' });
  await rejects(completeUpload(ready.id, actor), 409);
});

test('only cleared assets are listed for art direction', async () => {
  await createMediaAsset(prisma, { cleared: true, aspect: '1:1', tags: ['logo'] });
  await createMediaAsset(prisma, { cleared: false });
  await createMediaAsset(prisma, { cleared: true, status: 'pending' });
  const cleared = await listMedia({ cleared: true });
  assert.equal(cleared.length, 1);
  assert.equal((await listMedia({})).length, 2, 'pending uploads are not listed');
  assert.equal((await listMedia({ tag: 'logo' })).length, 1);
  assert.equal((await listMedia({ aspect: '1:1' })).length, 1);
  assert.equal((await listMedia({ kind: 'video' })).length, 0);
});

test('setClearance stores flag and note; downloadUrl uses stored name and <=900s', async () => {
  const a = await createMediaAsset(prisma, { fileName: 'hero.png' });
  const dto = await setClearance(a.id, { cleared: true, note: 'Photo à moi' }, actor);
  assert.equal(dto.cleared, true);
  assert.equal(dto.clearanceNote, 'Photo à moi');
  const url = await downloadUrl(a.id, 'hero.png');
  assert.match(url, /ttl=900/);
  assert.match(url, /name=hero\.png/);
  await rejects(setClearance('00000000-0000-4000-8000-0000000000ff', { cleared: true }, actor), 404);
  const pending = await createMediaAsset(prisma, { status: 'pending' });
  await rejects(downloadUrl(pending.id, 'x.png'), 409);
});
