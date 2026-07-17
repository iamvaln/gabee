import '../../../test/setup-integration';
import { randomUUID } from 'node:crypto';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestClient,
  resetDb,
  createCurriculum,
  createContentPlan,
  createQuestion,
} from '@gabee/db/testing';
import { getPlan, savePlan, acceptPlan, getPool, confirmPool, reviewQuestion, bulkSetQuestionStatus } from './admin-content';
import { HttpError } from '../http';
import { POOL_TARGET } from '../admin';
import type { Prisma } from '@gabee/db';

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

// ─── C3/C4 · Pool (getPool / confirmPool) + review + bulk status ────────────

/**
 * `ratingRollup` (admin-content.ts) averages `{ score, lang }` entries per
 * language — it ignores any other keys, so a bare `{ score, lang }` array is
 * the full shape needed for a rating to count. "Rated ≥4 both languages"
 * means one `fr` entry and one `en` entry each with `score >= 4`.
 */
const HIGH_RATINGS = [
  { score: 5, lang: 'fr' },
  { score: 5, lang: 'en' },
];
const LOW_RATINGS = [
  { score: 2, lang: 'fr' },
  { score: 2, lang: 'en' },
];

const POOL_SLOT = { module: 'numbers' as const, subMode: 'default', level: 1 as const };

function highRatedCandidate(curriculumId: string, i: number) {
  return createQuestion(prisma, {
    id: `q-hi-${i}`,
    curriculumId,
    module: POOL_SLOT.module,
    subMode: POOL_SLOT.subMode,
    level: POOL_SLOT.level,
    status: 'candidate',
    ratings: HIGH_RATINGS as unknown as Prisma.InputJsonValue,
  });
}

function lowRatedCandidate(curriculumId: string, i: number) {
  return createQuestion(prisma, {
    id: `q-lo-${i}`,
    curriculumId,
    module: POOL_SLOT.module,
    subMode: POOL_SLOT.subMode,
    level: POOL_SLOT.level,
    status: 'candidate',
    ratings: LOW_RATINGS as unknown as Prisma.InputJsonValue,
  });
}

test('getPool: splits candidates/confirmed, reports pool_target, plan_accepted and rated_high', async () => {
  await createContentPlan(prisma, { ...FULL_PLAN_OVERRIDES, status: 'accepted' });
  for (let i = 0; i < 3; i++) await highRatedCandidate(DEFAULT_CURRICULUM_ID, i);
  for (let i = 0; i < 2; i++) await lowRatedCandidate(DEFAULT_CURRICULUM_ID, i);
  await createQuestion(prisma, {
    id: 'q-confirmed-1',
    curriculumId: DEFAULT_CURRICULUM_ID,
    module: POOL_SLOT.module,
    subMode: POOL_SLOT.subMode,
    level: POOL_SLOT.level,
    status: 'confirmed',
    ratings: HIGH_RATINGS as unknown as Prisma.InputJsonValue,
  });

  const pool = await getPool(POOL_SLOT.module, POOL_SLOT.subMode, POOL_SLOT.level);

  assert.equal(pool.pool_target, 20);
  assert.equal(pool.plan_accepted, true);
  assert.equal(pool.candidates.length, 5, '3 high + 2 low candidates, confirmed excluded');
  assert.equal(pool.confirmed.length, 1);
  assert.equal(pool.rated_high, 3, 'only the 3 high-rated CANDIDATES count, not the confirmed row');
});

test('getPool: plan_accepted is false when no plan (or a non-accepted plan) exists for the slot', async () => {
  const pool = await getPool(POOL_SLOT.module, POOL_SLOT.subMode, POOL_SLOT.level);
  assert.equal(pool.plan_accepted, false);
  assert.deepEqual(pool.candidates, []);
  assert.deepEqual(pool.confirmed, []);
  assert.equal(pool.rated_high, 0);
});

test('confirmPool: exactly POOL_TARGET high-rated candidates promotes all of them to confirmed', async () => {
  assert.equal(POOL_TARGET, 20, 'sanity check the constant this test seeds against');
  for (let i = 0; i < POOL_TARGET; i++) await highRatedCandidate(DEFAULT_CURRICULUM_ID, i);

  const result = await confirmPool(POOL_SLOT.module, POOL_SLOT.subMode, POOL_SLOT.level);

  assert.deepEqual(result, { confirmed: 20 });
  const confirmedCount = await prisma.question.count({
    where: { curriculumId: DEFAULT_CURRICULUM_ID, status: 'confirmed' },
  });
  assert.equal(confirmedCount, 20, 'all 20 seeded rows are now confirmed in the DB');
  const stillCandidate = await prisma.question.count({
    where: { curriculumId: DEFAULT_CURRICULUM_ID, status: 'candidate' },
  });
  assert.equal(stillCandidate, 0);
});

test('confirmPool: under target (19 high-rated) 409s pool_under_target and promotes nothing', async () => {
  for (let i = 0; i < POOL_TARGET - 1; i++) await highRatedCandidate(DEFAULT_CURRICULUM_ID, i);
  for (let i = 0; i < 3; i++) await lowRatedCandidate(DEFAULT_CURRICULUM_ID, i);

  await assert.rejects(
    () => confirmPool(POOL_SLOT.module, POOL_SLOT.subMode, POOL_SLOT.level),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'pool_under_target',
  );

  const confirmedCount = await prisma.question.count({
    where: { curriculumId: DEFAULT_CURRICULUM_ID, status: 'confirmed' },
  });
  assert.equal(confirmedCount, 0, 'no candidate is promoted when the pool is under target');
});

test('reviewQuestion: applies a per-language rating, recomputes avgRating, and can flip status', async () => {
  const row = await createQuestion(prisma, {
    curriculumId: DEFAULT_CURRICULUM_ID,
    module: POOL_SLOT.module,
    subMode: POOL_SLOT.subMode,
    level: POOL_SLOT.level,
    status: 'candidate',
    ratings: [] as unknown as Prisma.InputJsonValue,
  });

  const rated = await reviewQuestion(row.id, { rating: { fr: 4, en: 5 } }, 'admin-actor-1');

  assert.equal(rated.ratings.fr.score, 4);
  assert.equal(rated.ratings.fr.count, 1);
  assert.equal(rated.ratings.en.score, 5);
  assert.equal(rated.ratings.en.count, 1);
  const afterRating = await prisma.question.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(afterRating.avgRating, 4.5, 'avgRating is recomputed over all recorded ratings');
  assert.equal(afterRating.status, 'candidate', 'no status change requested yet');

  const flipped = await reviewQuestion(row.id, { status: 'rejected' }, 'admin-actor-1');
  assert.equal(flipped.status, 'rejected');
});

test('reviewQuestion: an unknown question id 404s question_not_found', async () => {
  await assert.rejects(
    () => reviewQuestion('does-not-exist', { rating: { fr: 5 } }, 'admin-actor-1'),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'question_not_found',
  );
});

test('bulkSetQuestionStatus: sets all given ids to confirmed/rejected/demoted and returns the count', async () => {
  const confirmedIds = await Promise.all(
    [0, 1, 2].map(async () => (await createQuestion(prisma, { curriculumId: DEFAULT_CURRICULUM_ID })).id),
  );
  const rejectedIds = await Promise.all(
    [0, 1].map(async () => (await createQuestion(prisma, { curriculumId: DEFAULT_CURRICULUM_ID })).id),
  );
  const demotedIds = [
    (await createQuestion(prisma, { curriculumId: DEFAULT_CURRICULUM_ID, status: 'confirmed' })).id,
  ];

  const confirmedResult = await bulkSetQuestionStatus(confirmedIds, 'confirmed');
  assert.equal(confirmedResult, 3);
  const rejectedResult = await bulkSetQuestionStatus(rejectedIds, 'rejected');
  assert.equal(rejectedResult, 2);
  const demotedResult = await bulkSetQuestionStatus(demotedIds, 'demoted');
  assert.equal(demotedResult, 1);

  const rows = await prisma.question.findMany({
    where: { id: { in: [...confirmedIds, ...rejectedIds, ...demotedIds] } },
    select: { id: true, status: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r.status]));
  for (const id of confirmedIds) assert.equal(byId.get(id), 'confirmed');
  for (const id of rejectedIds) assert.equal(byId.get(id), 'rejected');
  for (const id of demotedIds) assert.equal(byId.get(id), 'demoted');
});
