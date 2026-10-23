import '../../../../../test/setup-integration';
import test, { after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContentDraft, createContentSlot, createContentWeek, createMediaAsset, createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '@/test/factories';
import { parentToken, adminCookie, parentCookie, webRequest } from '@/test/auth';
import { MemoryStorage } from '@/lib/server/storage/memory';
import { setStorage, resetStorage } from '@/lib/server/storage';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { setErrorReporterForTests } from '@/lib/server/report-error';
import { GET as list, POST as init } from './route';
import { PATCH as patch } from './[id]/route';
import { POST as complete } from './[id]/complete/route';
import { GET as download } from './[id]/download/route';

const prisma = createTestClient();
const U = 'http://localhost/api/admin/communication/media';
let store: MemoryStorage;
let cookie: { name: string; value: string };

beforeEach(async () => {
  await resetDb(prisma);
  store = new MemoryStorage();
  setStorage(store);
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  cookie = adminCookie(await parentToken(parent.id, parent.email));
});
afterEach(() => {
  resetStorage();
  setErrorReporterForTests(null);
});
after(() => prisma.$disconnect());

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

test('download route requires admin and returns a 302 to a presigned URL', async () => {
  const a = await createMediaAsset(prisma, { fileName: 'hero.png' });
  assert.equal((await download(webRequest(`${U}/${a.id}/download`, { method: 'GET' }), ctx(a.id))).status, 401);

  const { parent } = await createLoginableParent(prisma, { role: 'parent' });
  const pc = parentCookie(await parentToken(parent.id, parent.email));
  assert.equal((await download(webRequest(`${U}/${a.id}/download`, { method: 'GET', cookie: pc }), ctx(a.id))).status, 403);

  const res = await download(webRequest(`${U}/${a.id}/download`, { method: 'GET', cookie }), ctx(a.id));
  assert.equal(res.status, 302);
  const loc = res.headers.get('location') ?? '';
  assert.match(loc, /ttl=900/);
  assert.match(loc, /name=hero\.png/);
});

test('init -> complete -> clear -> list flow is audited', async () => {
  const r = await init(webRequest(U, { cookie, body: { file_name: 'a.png', mime: 'image/png', size_bytes: 16 } }), undefined);
  assert.equal(r.status, 200);
  const { assetId, uploadUrl } = await r.json();
  assert.ok(uploadUrl);
  const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  store.putObject(row.objectKey, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]), 'image/png');

  const c = await complete(webRequest(`${U}/${assetId}/complete`, { cookie }), ctx(assetId));
  assert.equal((await c.json()).asset.status, 'ready');

  const p = await patch(webRequest(`${U}/${assetId}`, { method: 'PATCH', cookie, body: { cleared: true, note: 'ok' } }), ctx(assetId));
  assert.equal(p.status, 200);

  const l = await list(webRequest(`${U}?cleared=true`, { method: 'GET', cookie }), undefined);
  assert.equal((await l.json()).assets.length, 1);

  const kinds = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => a.kind);
  assert.deepEqual(kinds, ['content.media.init', 'content.media.complete', 'content.media.clearance']);
});

test('init rejects an oversize video with 422', async () => {
  const r = await init(webRequest(U, { cookie, body: { file_name: 'a.mp4', mime: 'video/mp4', size_bytes: 301 * 1024 * 1024, aspect: '16:9' } }), undefined);
  assert.equal(r.status, 422);
});

test('library list says which drafts use each asset', async () => {
  const a = await createMediaAsset(prisma, { fileName: 'used.png' });
  const b = await createMediaAsset(prisma, { fileName: 'free.png' });
  const week = await createContentWeek(prisma, { status: 'validated' });
  const slot = await createContentSlot(prisma, week.id);
  await createContentDraft(prisma, slot.id, { platform: 'linkedin', status: 'approved', mediaAssetId: a.id });
  const slot2 = await createContentSlot(prisma, week.id);
  await createContentDraft(prisma, slot2.id, { platform: 'linkedin', status: 'published', mediaAssetId: a.id });
  await createContentDraft(prisma, slot2.id, { platform: 'tiktok', status: 'ready', mediaAssetId: a.id });

  const res = await list(webRequest(U, { method: 'GET', cookie }), undefined);
  const { assets } = await res.json();
  const byName = (n: string) => assets.find((x: { fileName: string }) => x.fileName === n);
  assert.deepEqual(byName('used.png').usage, { approved: 1, published: 1, other: 1 });
  assert.deepEqual(byName('free.png').usage, { approved: 0, published: 0, other: 0 });
  assert.ok(b);
});

test('tags follow the upload rules: at most 10, trimmed, without #, deduplicated', async () => {
  const a = await createMediaAsset(prisma);
  const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
  const tooMany = await patch(webRequest(`${U}/${a.id}`, { method: 'PATCH', cookie, body: { tags: eleven } }), ctx(a.id));
  assert.equal(tooMany.status, 422);

  const ok = await patch(webRequest(`${U}/${a.id}`, { method: 'PATCH', cookie, body: { tags: [' #Code ', 'code', 'Niveau 2', '#'] } }), ctx(a.id));
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).asset.tags, ['code', 'niveau 2']);

  const init2 = await init(
    webRequest(U, { cookie, body: { file_name: 'b.png', mime: 'image/png', size_bytes: 16, tags: ['#Lecture', 'lecture'] } }),
    undefined,
  );
  const { assetId } = await init2.json();
  assert.deepEqual((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } })).tags, ['lecture']);
});

test('clearing keeps its note; removing the clearance records why', async () => {
  const a = await createMediaAsset(prisma);
  const on = await patch(webRequest(`${U}/${a.id}`, { method: 'PATCH', cookie, body: { cleared: true, note: 'Droits vérifiés' } }), ctx(a.id));
  assert.deepEqual([(await on.json()).asset.cleared, (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: a.id } })).clearanceNote], [true, 'Droits vérifiés']);
  const off = await patch(webRequest(`${U}/${a.id}`, { method: 'PATCH', cookie, body: { cleared: false, note: 'Un enfant reconnaissable' } }), ctx(a.id));
  const row = (await off.json()).asset;
  assert.deepEqual([row.cleared, row.clearanceNote], [false, 'Un enfant reconnaissable']);
});

/** R2 refusing every call (wrong account id, revoked token, bucket typo). */
class RefusingStorage extends MemoryStorage {
  private refuse(): never {
    throw new S3ServiceException({ name: 'AccessDenied', $fault: 'client', $metadata: { httpStatusCode: 403 }, message: 'Access Denied' });
  }
  override presignPut(): Promise<string> {
    return this.refuse();
  }
  override presignGet(): Promise<string> {
    return this.refuse();
  }
  override head(): Promise<{ sizeBytes: number; mime: string | null } | null> {
    return this.refuse();
  }
}

test('an R2 refusal answers 503 storage_unavailable in French, reported once', async () => {
  const reported: unknown[] = [];
  setErrorReporterForTests((err) => reported.push(err));
  setStorage(new RefusingStorage());
  const isStorage = async (res: Response) => {
    assert.equal(res.status, 503);
    const { error } = await res.json();
    assert.equal(error.code, 'storage_unavailable');
    assert.match(error.message, /Le stockage des médias/);
  };

  await isStorage(await init(webRequest(U, { cookie, body: { file_name: 'a.png', mime: 'image/png', size_bytes: 16 } }), undefined));
  const pending = await createMediaAsset(prisma, { status: 'pending' });
  await isStorage(await complete(webRequest(`${U}/${pending.id}/complete`, { cookie }), ctx(pending.id)));
  const ready = await createMediaAsset(prisma, { fileName: 'hero.png' });
  await isStorage(await download(webRequest(`${U}/${ready.id}/download`, { method: 'GET', cookie }), ctx(ready.id)));
  assert.equal(reported.length, 3);
});

test('a malformed media id is a 404, not a database error', async () => {
  const bad = 'not-a-uuid';
  for (const res of [
    await patch(webRequest(`${U}/${bad}`, { method: 'PATCH', cookie, body: { cleared: true } }), ctx(bad)),
    await complete(webRequest(`${U}/${bad}/complete`, { cookie }), ctx(bad)),
    await download(webRequest(`${U}/${bad}/download`, { method: 'GET', cookie }), ctx(bad)),
  ]) {
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, 'not_found');
  }
});
