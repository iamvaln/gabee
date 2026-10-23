process.env.DATABASE_URL ??= 'postgresql://localhost:5432/gabee_test';
import test from 'node:test';
import assert from 'node:assert/strict';

const r2Env = { MEDIA_R2_ACCOUNT_ID: 'acc', MEDIA_R2_ACCESS_KEY_ID: 'k', MEDIA_R2_SECRET_ACCESS_KEY: 's', MEDIA_R2_BUCKET: 'b' };

test('memory storage is refused in production', async () => {
  const { selectStorage } = await import('./index');
  assert.throws(
    () => selectStorage({ STORAGE_DRIVER: 'memory' }, true),
    (e: unknown) => (e as { status?: number; code?: string }).status === 503 && (e as { code?: string }).code === 'storage_unavailable',
  );
});

test('selectStorage: memory outside prod, r2 when env complete, 503 otherwise', async () => {
  const { selectStorage } = await import('./index');
  const { MemoryStorage } = await import('./memory');
  const { R2Storage } = await import('./r2');
  assert.ok(selectStorage({ STORAGE_DRIVER: 'memory' }, false) instanceof MemoryStorage);
  assert.ok(selectStorage(r2Env, true) instanceof R2Storage);
  assert.throws(() => selectStorage({}, false), (e: unknown) => (e as { status?: number }).status === 503);
  assert.throws(() => selectStorage({ ...r2Env, MEDIA_R2_BUCKET: undefined }, false), (e: unknown) => (e as { status?: number }).status === 503);
});

test('MemoryStorage head/readRange/delete round-trip and presign ttl', async () => {
  const { MemoryStorage } = await import('./memory');
  const s = new MemoryStorage();
  assert.equal(await s.head('a'), null);
  s.putObject('a', Uint8Array.from([1, 2, 3, 4, 5]), 'image/png');
  assert.deepEqual(await s.head('a'), { sizeBytes: 5, mime: 'image/png' });
  assert.deepEqual([...(await s.readRange('a', 3))], [1, 2, 3]);
  const url = await s.presignGet('a', 'x.png', 600);
  assert.match(url, /ttl=600/);
  await s.delete('a');
  await s.delete('a');
  assert.equal(await s.head('a'), null);
});
