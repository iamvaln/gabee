import test from 'node:test';
import assert from 'node:assert/strict';
import { R2Storage } from './r2';

test('presignPut signs content-type and content-length (no network)', async () => {
  const s = new R2Storage({ accountId: 'acc', accessKeyId: 'AKID', secretAccessKey: 'secret', bucket: 'b' });
  const url = new URL(await s.presignPut('media/2026/10/x.png', 'image/png', 1234, 900));
  assert.equal(url.host, 'acc.r2.cloudflarestorage.com');
  const signed = (url.searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
  assert.ok(signed.includes('content-type'), `signed: ${signed}`);
  assert.ok(signed.includes('content-length'), `signed: ${signed}`);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '900');
});
