import '../../../test/setup-integration';
import { randomUUID } from 'node:crypto';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createCurriculum, createContentPlan, createQuestion } from '@gabee/db/testing';
import { listSubModes, createSubMode, updateSubMode, deleteSubMode } from './admin-sub-modes';
import { HttpError } from '../http';
import type { CreateSubModeRequest } from '@gabee/types';

const prisma = createTestClient();
const CURRICULUM_ID = randomUUID();

beforeEach(async () => {
  await resetDb(prisma);
  await createCurriculum(prisma, { id: CURRICULUM_ID, isDefault: true });
});
after(async () => prisma.$disconnect());

function subModeBody(overrides: Partial<CreateSubModeRequest> = {}): CreateSubModeRequest {
  return {
    module: 'numbers',
    key: 'counting',
    name: { fr: 'Comptage', en: 'Counting' },
    language_dependent: false,
    display_order: 1,
    mechanic_hint: 'count up',
    ...overrides,
  } as CreateSubModeRequest;
}

test('listSubModes: returns all, filters by module, and 400s an invalid module', async () => {
  await createSubMode(subModeBody({ module: 'numbers', key: 'counting' }));
  await createSubMode(subModeBody({ module: 'words', key: 'picture', name: { fr: 'Image', en: 'Picture' } }));

  const all = await listSubModes();
  assert.equal(all.sub_modes.length, 2);

  const numbersOnly = await listSubModes('numbers');
  assert.deepEqual(
    numbersOnly.sub_modes.map((s) => s.id),
    ['numbers.counting'],
  );

  await assert.rejects(
    () => listSubModes('astrology'),
    (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === 'invalid_module',
  );
});

test('createSubMode: creates a (module, key) slot; a duplicate 409s sub_mode_exists', async () => {
  const created = await createSubMode(subModeBody({ module: 'numbers', key: 'counting' }));
  assert.equal(created.id, 'numbers.counting');
  assert.equal(created.key, 'counting');

  await assert.rejects(
    () => createSubMode(subModeBody({ module: 'numbers', key: 'counting' })),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'sub_mode_exists',
  );
  const count = await prisma.subMode.count({ where: { id: 'numbers.counting' } });
  assert.equal(count, 1, 'the duplicate attempt did not create a second row');
});

test('updateSubMode: updates fields; an unknown id 404s sub_mode_not_found', async () => {
  await createSubMode(subModeBody({ module: 'numbers', key: 'counting' }));

  const updated = await updateSubMode('numbers.counting', { display_order: 5, mechanic_hint: 'count down' });
  assert.equal(updated.display_order, 5);
  assert.equal(updated.mechanic_hint, 'count down');

  await assert.rejects(
    () => updateSubMode('numbers.missing', { display_order: 1 }),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'sub_mode_not_found',
  );
});

test('deleteSubMode: removes an unreferenced sub-mode; an unknown id 404s', async () => {
  await createSubMode(subModeBody({ module: 'numbers', key: 'counting' }));

  const res = await deleteSubMode('numbers.counting');
  assert.deepEqual(res, { id: 'numbers.counting' });
  assert.equal(await prisma.subMode.count({ where: { id: 'numbers.counting' } }), 0);

  await assert.rejects(
    () => deleteSubMode('numbers.missing'),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'sub_mode_not_found',
  );
});

test('deleteSubMode: 409 sub_mode_in_use when a Question references it (legacy short-key form)', async () => {
  await createSubMode(subModeBody({ module: 'numbers', key: 'counting' }));
  // Question.subMode stores the legacy SHORT key ('counting'), which the service
  // matches within the same module.
  await createQuestion(prisma, { curriculumId: CURRICULUM_ID, module: 'numbers', subMode: 'counting' });

  await assert.rejects(
    () => deleteSubMode('numbers.counting'),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'sub_mode_in_use',
  );
  assert.equal(
    await prisma.subMode.count({ where: { id: 'numbers.counting' } }),
    1,
    'a blocked delete leaves the sub-mode intact',
  );
});

test('deleteSubMode: 409 sub_mode_in_use when a ContentPlan references it (dotted-id form)', async () => {
  await createSubMode(subModeBody({ module: 'numbers', key: 'counting' }));
  // ContentPlan.subMode stores the full dotted id.
  await createContentPlan(prisma, { curriculumId: CURRICULUM_ID, moduleId: 'numbers', subMode: 'numbers.counting', level: 1 });

  await assert.rejects(
    () => deleteSubMode('numbers.counting'),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'sub_mode_in_use',
  );
  assert.equal(await prisma.subMode.count({ where: { id: 'numbers.counting' } }), 1);
});
