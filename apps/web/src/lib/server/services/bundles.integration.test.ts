import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createCurriculum, createQuestion } from '@gabee/db/testing';
import { getManifest, getBundle } from './bundles';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

/**
 * Bundles serve ONLY the `confirmed` pool (bundles.ts doc comment, §5/§8). Real
 * content starts life `candidate` and is promoted by `prisma/publish.mts`
 * (confirm + mint a `ContentBundleVersion` snapshot). These tests mirror that
 * promotion directly via Prisma rather than mocking anything.
 *
 * `createQuestion`'s default `prompt: { text: ... }` isn't a valid
 * `QuestionValueSchema` (bare string/number, or bilingual `{fr,en}` — see
 * packages/types/src/question.ts) and blows up `mapQuestion` once a confirmed
 * question actually gets served through `getBundle`. Every question below
 * that's expected to reach `mapQuestion` overrides `prompt` with a bare string.
 */
const VALID_PROMPT = '2 + 2';

test('getManifest: only lists modules with confirmed content; a candidate-only module is absent', async () => {
  const curriculum = await createCurriculum(prisma);
  // numbers: 2 confirmed questions.
  await createQuestion(prisma, { curriculumId: curriculum.id, module: 'numbers', status: 'confirmed', prompt: VALID_PROMPT });
  await createQuestion(prisma, { curriculumId: curriculum.id, module: 'numbers', status: 'confirmed', prompt: VALID_PROMPT });
  // words: candidate only — must NOT appear in the manifest.
  await createQuestion(prisma, { curriculumId: curriculum.id, module: 'words', status: 'candidate', prompt: VALID_PROMPT });

  const manifest = await getManifest();

  const modules = manifest.map((e) => e.module);
  assert.ok(modules.includes('numbers'), 'a module with confirmed content must appear');
  assert.ok(!modules.includes('words'), 'a module with only candidate content must not appear');

  const numbersEntry = manifest.find((e) => e.module === 'numbers');
  assert.ok(numbersEntry);
  assert.equal(numbersEntry.version, 0, 'getManifest is the live-pool-only legacy path — always version 0');
  assert.equal(numbersEntry.question_count, 2);
  assert.ok(typeof numbersEntry.published_at === 'string' && !Number.isNaN(Date.parse(numbersEntry.published_at)));
});

test('getBundle(module): live confirmed-pool fallback (no snapshot) returns only confirmed questions at version 0', async () => {
  const curriculum = await createCurriculum(prisma);
  const confirmed = await createQuestion(prisma, {
    curriculumId: curriculum.id,
    module: 'numbers',
    status: 'confirmed',
    prompt: VALID_PROMPT,
  });
  const candidate = await createQuestion(prisma, {
    curriculumId: curriculum.id,
    module: 'numbers',
    status: 'candidate',
    prompt: VALID_PROMPT,
  });
  const rejected = await createQuestion(prisma, {
    curriculumId: curriculum.id,
    module: 'numbers',
    status: 'rejected',
    prompt: VALID_PROMPT,
  });

  const bundle = await getBundle('numbers');

  assert.equal(bundle.module, 'numbers');
  assert.equal(bundle.version, 0, 'no ContentBundleVersion snapshot exists -> version 0 fallback');
  const ids = bundle.questions.map((q) => q.id);
  assert.deepEqual(ids, [confirmed.id], 'only the confirmed question is served');
  assert.ok(!ids.includes(candidate.id), 'candidate questions are excluded');
  assert.ok(!ids.includes(rejected.id), 'rejected questions are excluded');
});

test('getBundle(module): with a published snapshot, returns exactly the snapshotted question ids (not the live pool)', async () => {
  const curriculum = await createCurriculum(prisma);
  const original = await createQuestion(prisma, {
    curriculumId: curriculum.id,
    module: 'numbers',
    status: 'confirmed',
    prompt: VALID_PROMPT,
  });

  const publishedAt = new Date('2026-01-01T00:00:00.000Z');
  await prisma.contentBundleVersion.create({
    data: {
      module: 'numbers',
      version: 1,
      publishedAt,
      questionCount: 1,
      questionIds: [original.id],
    },
  });

  // Confirmed AFTER the snapshot was minted — must not leak into the v1 bundle.
  await createQuestion(prisma, {
    curriculumId: curriculum.id,
    module: 'numbers',
    status: 'confirmed',
    prompt: VALID_PROMPT,
  });

  const bundle = await getBundle('numbers');

  assert.equal(bundle.version, 1, 'a snapshot exists -> latest snapshot is served, not version 0');
  assert.equal(bundle.published_at, publishedAt.toISOString());
  assert.deepEqual(
    bundle.questions.map((q) => q.id),
    [original.id],
    'only the questions frozen into the snapshot are served, regardless of what is confirmed now',
  );
});

test('getBundle(module, version): an explicit version loads that exact snapshot even when a newer one exists', async () => {
  const curriculum = await createCurriculum(prisma);
  const v1Question = await createQuestion(prisma, {
    curriculumId: curriculum.id,
    module: 'numbers',
    status: 'confirmed',
    prompt: VALID_PROMPT,
  });
  const v2Question = await createQuestion(prisma, {
    curriculumId: curriculum.id,
    module: 'numbers',
    status: 'confirmed',
    prompt: VALID_PROMPT,
  });

  await prisma.contentBundleVersion.create({
    data: { module: 'numbers', version: 1, questionCount: 1, questionIds: [v1Question.id] },
  });
  await prisma.contentBundleVersion.create({
    data: { module: 'numbers', version: 2, questionCount: 2, questionIds: [v1Question.id, v2Question.id] },
  });

  const v1Bundle = await getBundle('numbers', 1);
  assert.equal(v1Bundle.version, 1);
  assert.deepEqual(v1Bundle.questions.map((q) => q.id), [v1Question.id]);

  // No version param -> latest (v2), not v1.
  const latestBundle = await getBundle('numbers');
  assert.equal(latestBundle.version, 2);
  assert.deepEqual(
    latestBundle.questions.map((q) => q.id).sort(),
    [v1Question.id, v2Question.id].sort(),
  );
});

test('getBundle(module, version): requesting a version with no matching snapshot 404s bundle_not_found (no silent fallback)', async () => {
  const curriculum = await createCurriculum(prisma);
  const question = await createQuestion(prisma, {
    curriculumId: curriculum.id,
    module: 'numbers',
    status: 'confirmed',
  });
  await prisma.contentBundleVersion.create({
    data: { module: 'numbers', version: 1, questionCount: 1, questionIds: [question.id] },
  });

  await assert.rejects(
    () => getBundle('numbers', 2),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'bundle_not_found',
  );
});

test('getBundle(module, version): requesting version=0 or a non-positive-integer 400s invalid_version', async () => {
  await assert.rejects(
    () => getBundle('numbers', 0),
    (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === 'invalid_version',
  );
  await assert.rejects(
    () => getBundle('numbers', -1),
    (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === 'invalid_version',
  );
  await assert.rejects(
    () => getBundle('numbers', 1.5),
    (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === 'invalid_version',
  );
});

test('getBundle(module): a module with zero confirmed questions and no snapshot 404s bundle_not_found', async () => {
  await assert.rejects(
    () => getBundle('numbers'),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'bundle_not_found',
  );
});

test('getBundle: an unknown module string 400s invalid_module', async () => {
  await assert.rejects(
    () => getBundle('astrology'),
    (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === 'invalid_module',
  );
});

test('getManifest: an empty DB returns an empty manifest (no modules have confirmed content)', async () => {
  const manifest = await getManifest();
  assert.deepEqual(manifest, []);
});
