import '../../../test/setup-integration';
import { randomUUID } from 'node:crypto';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createCurriculum, createContentPlan } from '@gabee/db/testing';
import { getPlan, savePlan, acceptPlan } from './admin-content';
import { HttpError } from '../http';

const prisma = createTestClient();

/**
 * `getDefaultCurriculumId()` (../admin.ts) memoizes the resolved curriculum id
 * in a module-level `let` for the lifetime of the process — it is NOT
 * re-queried per call. Since `node:test` runs every test in this file in one
 * process, the cache locks onto whatever curriculum id it first observes and
 * keeps returning that id even after `resetDb` truncates the table. To keep
 * every test's curriculum "the default one" from the cache's point of view,
 * we always (re)seed the default curriculum with this SAME fixed id — so
 * whichever test runs first, the cache and the freshly-truncated DB agree.
 */
const DEFAULT_CURRICULUM_ID = randomUUID();

beforeEach(async () => {
  await resetDb(prisma);
  await createCurriculum(prisma, { id: DEFAULT_CURRICULUM_ID, isDefault: true });
});
after(async () => prisma.$disconnect());

const FULL_PLAN_OVERRIDES = {
  curriculumId: DEFAULT_CURRICULUM_ID,
  moduleId: 'numbers',
  subMode: 'default',
  level: 1,
  scope: { fr: 'Portée FR', en: 'Scope EN' },
  pedagogicalObjectives: [{ fr: 'Objectif FR', en: 'Objective EN' }],
  validationCriteria: { fr: 'Critère FR', en: 'Criteria EN' },
  status: 'pending',
} as const;

test('getPlan: an empty (module, sub_mode, level) slot returns { plan: null } without throwing', async () => {
  const result = await getPlan('numbers', 'default', 1);

  assert.equal(result.plan, null);
  assert.equal(result.module, 'numbers');
  assert.equal(result.sub_mode, 'default');
  assert.equal(result.level, 1);
  assert.equal(result.prereqs_met, true, 'level 1 has no prior level to gate on');
  assert.deepEqual(result.prev_context, []);
});

test('savePlan: upserts — a second save to the same (curriculum, module, sub_mode, level) updates the existing row, not a new one', async () => {
  const base = { module: 'numbers' as const, sub_mode: 'default', level: 1 };

  const first = await savePlan({
    ...base,
    scope: { fr: 'Portée FR v1', en: 'Scope EN v1' },
    pedagogical_objectives: [{ fr: 'Obj FR v1', en: 'Obj EN v1' }],
    validation_criteria: { fr: 'Critère FR v1', en: 'Criteria EN v1' },
    notes: 'first save',
  });
  assert.equal(first.status, 'pending', 'a freshly-created plan (not an AI draft) starts pending');

  const second = await savePlan({
    ...base,
    scope: { fr: 'Portée FR v2', en: 'Scope EN v2' },
    pedagogical_objectives: [{ fr: 'Obj FR v2', en: 'Obj EN v2' }],
    validation_criteria: { fr: 'Critère FR v2', en: 'Criteria EN v2' },
    notes: 'second save',
  });

  assert.equal(second.id, first.id, 'the second save updates the same row (same id)');
  assert.deepEqual(second.scope, { fr: 'Portée FR v2', en: 'Scope EN v2' });
  assert.deepEqual(second.pedagogical_objectives, [{ fr: 'Obj FR v2', en: 'Obj EN v2' }]);
  assert.deepEqual(second.validation_criteria, { fr: 'Critère FR v2', en: 'Criteria EN v2' });
  assert.equal(second.notes, 'second save');

  const rows = await prisma.contentPlan.findMany({
    where: { curriculumId: DEFAULT_CURRICULUM_ID, moduleId: 'numbers', subMode: 'default', level: 1 },
  });
  assert.equal(rows.length, 1, 'exactly one plan row exists for this slot after two saves');
  assert.equal(rows[0]?.notes, 'second save', 'the surviving row reflects the second save, not the first');
});

test('acceptPlan: full FR/EN parity (scope, validation criteria, every objective) accepts and stamps the actor', async () => {
  await createContentPlan(prisma, FULL_PLAN_OVERRIDES);

  const accepted = await acceptPlan('numbers', 'default', 1, 'admin-actor-1');

  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.accepted_by, 'admin-actor-1');
  assert.ok(
    accepted.accepted_at && !Number.isNaN(Date.parse(accepted.accepted_at)),
    'accepted_at is stamped with a parseable ISO timestamp',
  );
});

test('acceptPlan: a missing slot 404s plan_not_found', async () => {
  await assert.rejects(
    () => acceptPlan('numbers', 'default', 1, 'admin-actor-1'),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'plan_not_found',
  );
});

async function assertNoMutation() {
  const row = await prisma.contentPlan.findFirst({
    where: { curriculumId: DEFAULT_CURRICULUM_ID, moduleId: 'numbers', subMode: 'default', level: 1 },
  });
  assert.ok(row, 'the plan row still exists');
  assert.equal(row?.status, 'pending', 'a failed parity check must not flip status to accepted');
  assert.equal(row?.acceptedBy, null);
  assert.equal(row?.acceptedAt, null);
}

test('acceptPlan: parity gate — scope.en empty 422s parity_required and leaves the plan pending', async () => {
  await createContentPlan(prisma, { ...FULL_PLAN_OVERRIDES, scope: { fr: 'Portée FR', en: '' } });

  await assert.rejects(
    () => acceptPlan('numbers', 'default', 1, 'admin-actor-1'),
    (e: unknown) => e instanceof HttpError && e.status === 422 && e.code === 'parity_required',
  );
  await assertNoMutation();
});

test('acceptPlan: parity gate — validation_criteria.fr empty 422s parity_required and leaves the plan pending', async () => {
  await createContentPlan(prisma, {
    ...FULL_PLAN_OVERRIDES,
    validationCriteria: { fr: '', en: 'Criteria EN' },
  });

  await assert.rejects(
    () => acceptPlan('numbers', 'default', 1, 'admin-actor-1'),
    (e: unknown) => e instanceof HttpError && e.status === 422 && e.code === 'parity_required',
  );
  await assertNoMutation();
});

test('acceptPlan: parity gate — zero objectives 422s parity_required and leaves the plan pending', async () => {
  await createContentPlan(prisma, { ...FULL_PLAN_OVERRIDES, pedagogicalObjectives: [] });

  await assert.rejects(
    () => acceptPlan('numbers', 'default', 1, 'admin-actor-1'),
    (e: unknown) => e instanceof HttpError && e.status === 422 && e.code === 'parity_required',
  );
  await assertNoMutation();
});

test('acceptPlan: parity gate — an objective missing its en text 422s parity_required and leaves the plan pending', async () => {
  await createContentPlan(prisma, {
    ...FULL_PLAN_OVERRIDES,
    pedagogicalObjectives: [
      { fr: 'Objectif FR complet', en: 'Objective EN complete' },
      { fr: 'Deuxième objectif FR', en: '' },
    ],
  });

  await assert.rejects(
    () => acceptPlan('numbers', 'default', 1, 'admin-actor-1'),
    (e: unknown) => e instanceof HttpError && e.status === 422 && e.code === 'parity_required',
  );
  await assertNoMutation();
});
