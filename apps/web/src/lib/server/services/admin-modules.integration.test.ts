import '../../../test/setup-integration';
import { randomUUID } from 'node:crypto';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createCurriculum, createModuleDef, createQuestion } from '@gabee/db/testing';
import { listModules, getModule, updateModule, setModuleStatus } from './admin-modules';
import { HttpError } from '../http';

const prisma = createTestClient();
const CURRICULUM_ID = randomUUID();

beforeEach(async () => {
  await resetDb(prisma);
  await createCurriculum(prisma, { id: CURRICULUM_ID, isDefault: true });
});
after(async () => prisma.$disconnect());

test('listModules: returns seeded modules with confirmed-question counts', async () => {
  await createModuleDef(prisma, { id: 'numbers' });
  await createModuleDef(prisma, { id: 'words', slug: 'words', name: { fr: 'Mots', en: 'Words' } });
  await createQuestion(prisma, { curriculumId: CURRICULUM_ID, module: 'numbers', status: 'confirmed' });
  await createQuestion(prisma, { curriculumId: CURRICULUM_ID, module: 'numbers', status: 'confirmed' });
  await createQuestion(prisma, { curriculumId: CURRICULUM_ID, module: 'numbers', status: 'candidate' });

  const { modules } = await listModules();

  const ids = modules.map((m) => m.id).sort();
  assert.deepEqual(ids, ['numbers', 'words']);
  const numbers = modules.find((m) => m.id === 'numbers');
  assert.equal(numbers?.confirmed_questions, 2, 'only confirmed questions are counted');
});

test('getModule: returns the detail for a seeded module', async () => {
  await createModuleDef(prisma, { id: 'numbers' });

  const { module } = await getModule('numbers');

  assert.equal(module.id, 'numbers');
  assert.equal(module.status, 'active');
});

test('getModule: an unknown module string 404s module_not_found', async () => {
  await assert.rejects(
    () => getModule('astrology'),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'module_not_found',
  );
});

test('getModule: a valid module enum with no seeded row 404s module_not_found', async () => {
  // 'code' is a real Module value but no ModuleDef row exists for it here.
  await assert.rejects(
    () => getModule('code'),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'module_not_found',
  );
});

test('updateModule: patches metadata and returns the refreshed detail', async () => {
  await createModuleDef(prisma, { id: 'numbers' });

  const { module } = await updateModule('numbers', {
    name: { fr: 'Nombres!', en: 'Numbers!' },
    color_token: 'green',
  });

  assert.deepEqual(module.name, { fr: 'Nombres!', en: 'Numbers!' });
  assert.equal(module.color_token, 'green');
  const row = await prisma.moduleDef.findUniqueOrThrow({ where: { id: 'numbers' } });
  assert.equal(row.colorToken, 'green');
});

test('updateModule: a valid enum with no row 404s module_not_found (P2025)', async () => {
  await assert.rejects(
    () => updateModule('code', { icon: 'bug' }),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'module_not_found',
  );
});

test('setModuleStatus: flips active<->disabled', async () => {
  await createModuleDef(prisma, { id: 'numbers', status: 'active' });

  const disabled = await setModuleStatus('numbers', { status: 'disabled' });
  assert.equal(disabled.module.status, 'disabled');
  const row = await prisma.moduleDef.findUniqueOrThrow({ where: { id: 'numbers' } });
  assert.equal(row.status, 'disabled');

  const reenabled = await setModuleStatus('numbers', { status: 'active' });
  assert.equal(reenabled.module.status, 'active');
});

test('setModuleStatus: an unknown module 404s module_not_found', async () => {
  await assert.rejects(
    () => setModuleStatus('code', { status: 'disabled' }),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'module_not_found',
  );
});
