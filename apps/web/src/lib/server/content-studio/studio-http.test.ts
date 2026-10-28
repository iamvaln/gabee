process.env.DATABASE_URL ??= 'postgresql://localhost:5432/gabee_test';
import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// The route kit imports the Prisma singleton, which validates env at import: load it after DATABASE_URL is set.
const { HttpError } = await import('../http');
const { setErrorReporterForTests } = await import('../report-error');
const { readOptionalJson, resetStorageUnavailableReportForTests, toHttpError } = await import('./studio-http');
const { RegenerateRequestSchema } = await import('@gabee/types');

afterEach(() => {
  setErrorReporterForTests(null);
  resetStorageUnavailableReportForTests();
  mock.restoreAll();
});

const unconfigured = () => new HttpError(503, 'storage_unavailable', 'Media storage is not configured. Set the MEDIA_R2_* variables and retry.');

test('unconfigured storage maps to a French 503 and is reported once per process', () => {
  const reported: Array<{ err: unknown; scope: string }> = [];
  setErrorReporterForTests((err, hint) => reported.push({ err, scope: hint.tags.scope }));
  mock.method(console, 'error', () => {});

  for (let i = 0; i < 3; i++) {
    const mapped = toHttpError(unconfigured(), { path: '/api/admin/communication/media' });
    assert.ok(mapped instanceof HttpError);
    assert.equal(mapped.status, 503);
    assert.equal(mapped.code, 'storage_unavailable');
    assert.match(mapped.message, /Le stockage des médias/);
  }
  assert.equal(reported.length, 1, 'one Sentry event, not one per request');
  assert.equal(reported[0]!.scope, 'content.api');
  assert.equal((reported[0]!.err as InstanceType<typeof HttpError>).code, 'storage_unavailable');
});

test('other HttpErrors pass through unreported', () => {
  const reported: unknown[] = [];
  setErrorReporterForTests((err) => reported.push(err));
  const err = new HttpError(409, 'invalid_transition', 'x');
  assert.equal(toHttpError(err), err);
  assert.equal(reported.length, 0);
});

test('an optional JSON body: empty is {}, a body must be declared JSON, bad JSON or shape is refused', async () => {
  const req = (body?: string, type?: string) =>
    new Request('http://x/api', { method: 'POST', body, headers: type ? { 'content-type': type } : undefined });
  assert.deepEqual(await readOptionalJson(req(), RegenerateRequestSchema), {});
  assert.deepEqual(await readOptionalJson(req('  '), RegenerateRequestSchema), {});
  assert.deepEqual(await readOptionalJson(req('  ', 'text/plain'), RegenerateRequestSchema), {});
  assert.deepEqual(await readOptionalJson(req('{"instruction":"Plus court"}', 'application/json'), RegenerateRequestSchema), { instruction: 'Plus court' });
  await assert.rejects(
    readOptionalJson(req('{"instruction":"Plus court"}', 'text/plain'), RegenerateRequestSchema),
    (e: unknown) => e instanceof HttpError && e.status === 415 && e.code === 'unsupported_media_type',
  );
  await assert.rejects(
    readOptionalJson(req('{"instruction":"Plus court"}'), RegenerateRequestSchema),
    (e: unknown) => e instanceof HttpError && e.status === 415,
  );
  await assert.rejects(readOptionalJson(req('{', 'application/json'), RegenerateRequestSchema), (e: unknown) => e instanceof HttpError && e.code === 'invalid_json');
  await assert.rejects(
    readOptionalJson(req(JSON.stringify({ instruction: 'x'.repeat(501) }), 'application/json'), RegenerateRequestSchema),
    (e: unknown) => e instanceof HttpError && e.status === 422 && e.code === 'validation_error',
  );
});
