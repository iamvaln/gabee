import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import {
  getAdminLimits,
  updateAdminLimits,
  getKidLimitsOverrides,
  updateKidLimitsOverrides,
  getKidEffectiveLimits,
  bumpStreakOnLessonCompleted,
} from './healthy-use';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

/**
 * The product-default triplets `getAdminLimits()` falls back to when the
 * `healthy_use_limits` singleton row doesn't exist yet (see healthy-use.ts).
 * Mirrored here (not imported) so the test also catches an accidental drift
 * in the service's fallback literal.
 */
const PRODUCT_DEFAULTS = {
  daily_lesson_target: { min: 1, default: 4, max: 12 },
  session_soft_limit_min: { min: 30, default: 60, max: 120 },
  session_hard_cap_min: { min: 45, default: 120, max: 180 },
  daily_total_cap_min: { min: 60, default: 180, max: 300 },
  look_away_interval_min: 10,
  look_away_pause_sec: 20,
  look_away_enabled_default: true,
  streak_enabled: true,
  badges_enabled: true,
};

// ─── REGRESSION GUARD: PR #24/#14 upsert fix ────────────────────────────────
//
// The `healthy_use_limits` table is created by migration but the migration
// never inserts the singleton row — it's created lazily on first save.
// Pre-PR#24, `updateAdminLimits` called `.update()`, which 500'd with P2025
// ("record not found") on the very first admin save in any freshly-migrated
// environment (dev, staging, prod-at-launch). The fix switched to `.upsert()`.
// `resetDb` gives us exactly that fresh-DB, no-singleton-row condition.

test('REGRESSION GUARD (PR #24): updateAdminLimits upserts on a fresh DB instead of 500ing (P2025) on the first save', async () => {
  const rowBefore = await prisma.healthyUseLimits.findUnique({ where: { id: 'default' } });
  assert.equal(rowBefore, null, 'sanity: fresh DB has no singleton row yet');

  const defaults = await getAdminLimits();
  assert.deepEqual(defaults, PRODUCT_DEFAULTS, 'getAdminLimits falls back to product defaults when the row is absent');

  // This is the exact call that used to throw P2025 -> 500 on a fresh DB.
  const saved = await updateAdminLimits({
    daily_lesson_target: { min: 2, default: 5, max: 10 },
    session_soft_limit_min: { default: 45 },
    streak_enabled: false,
  });

  assert.deepEqual(saved.daily_lesson_target, { min: 2, default: 5, max: 10 });
  assert.equal(saved.session_soft_limit_min.default, 45);
  assert.equal(saved.streak_enabled, false);
  // Untouched triplets/fields carry over from the (previously-defaulted) current state.
  assert.deepEqual(saved.session_hard_cap_min, PRODUCT_DEFAULTS.session_hard_cap_min);
  assert.equal(saved.badges_enabled, PRODUCT_DEFAULTS.badges_enabled);

  const rowAfter = await prisma.healthyUseLimits.findUnique({ where: { id: 'default' } });
  assert.ok(rowAfter, 'upsert must have self-created the singleton row');

  const reread = await getAdminLimits();
  assert.deepEqual(reread, saved, 'getAdminLimits must now reflect the persisted upsert, not the fallback defaults');
});

test('updateAdminLimits upserts again cleanly on a second save (update branch, row now exists)', async () => {
  await updateAdminLimits({ streak_enabled: false });
  const second = await updateAdminLimits({ streak_enabled: true, badges_enabled: false });
  assert.equal(second.streak_enabled, true);
  assert.equal(second.badges_enabled, false);

  const rows = await prisma.healthyUseLimits.count();
  assert.equal(rows, 1, 'the second save must update the existing singleton, not create a duplicate');
});

// ─── Triplet validation ─────────────────────────────────────────────────────

test('updateAdminLimits 400s invalid_triplet when min > default post-merge, and does not persist', async () => {
  await assert.rejects(
    () => updateAdminLimits({ daily_lesson_target: { min: 10, default: 5 } }),
    (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === 'invalid_triplet',
  );

  const row = await prisma.healthyUseLimits.findUnique({ where: { id: 'default' } });
  assert.equal(row, null, 'a rejected update must not self-create/mutate the singleton row');
});

test('updateAdminLimits 400s invalid_triplet when default > max post-merge', async () => {
  await assert.rejects(
    () => updateAdminLimits({ session_hard_cap_min: { default: 200 } }), // default max is 180
    (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === 'invalid_triplet',
  );
});

// ─── Kid overrides + effective-limits merge ─────────────────────────────────

test('kid overrides persist and getKidEffectiveLimits merges admin defaults with per-kid overrides (override wins where set)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  const overridesBefore = await getKidLimitsOverrides(child.id);
  assert.deepEqual(overridesBefore, {
    daily_lesson_target: null,
    session_soft_limit_min: null,
    session_hard_cap_min: null,
    daily_total_cap_min: null,
    look_away_enabled: null,
  });

  const admin = await getAdminLimits(); // no admin save yet -> product defaults
  const effectiveBefore = await getKidEffectiveLimits(child.id);
  assert.equal(effectiveBefore.daily_lesson_target, admin.daily_lesson_target.default);
  assert.equal(effectiveBefore.session_soft_limit_min, admin.session_soft_limit_min.default);
  assert.equal(effectiveBefore.look_away_enabled, admin.look_away_enabled_default);

  const saved = await updateKidLimitsOverrides(child.id, {
    daily_lesson_target: 7,
    look_away_enabled: false,
  });
  assert.equal(saved.daily_lesson_target, 7);
  assert.equal(saved.look_away_enabled, false);
  assert.equal(saved.session_soft_limit_min, null, 'fields not passed in the request stay null');

  const overridesAfter = await getKidLimitsOverrides(child.id);
  assert.deepEqual(overridesAfter, saved);

  const effectiveAfter = await getKidEffectiveLimits(child.id);
  assert.equal(effectiveAfter.daily_lesson_target, 7, 'kid override wins over the admin default');
  assert.equal(effectiveAfter.look_away_enabled, false, 'kid override wins over the admin default');
  assert.equal(
    effectiveAfter.session_soft_limit_min,
    admin.session_soft_limit_min.default,
    'admin default fills fields with no override',
  );
  assert.equal(effectiveAfter.session_hard_cap_min, admin.session_hard_cap_min.default);
  assert.equal(effectiveAfter.daily_total_cap_min, admin.daily_total_cap_min.default);
});

test('updateKidLimitsOverrides 400s override_out_of_range when the value is outside the admin [min,max] window', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const admin = await getAdminLimits(); // product defaults: daily_lesson_target max=12

  await assert.rejects(
    () => updateKidLimitsOverrides(child.id, { daily_lesson_target: admin.daily_lesson_target.max + 1 }),
    (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === 'override_out_of_range',
  );

  const overrides = await getKidLimitsOverrides(child.id);
  assert.equal(overrides.daily_lesson_target, null, 'a rejected override must not persist');
});

test('getKidEffectiveLimits clamps a stale override that falls outside the admin bounds after they tighten', async () => {
  const parent = await createParent(prisma);
  // Written directly (bypassing updateKidLimitsOverrides' own range check) to
  // simulate an override that was valid when set but is now stale because the
  // admin subsequently tightened the max — exactly the scenario the service's
  // own doc comment calls out ("a stale override after an admin tightens the
  // bounds doesn't escape").
  const child = await createChild(prisma, { parentId: parent.id, dailyLessonTargetOverride: 999 });

  await updateAdminLimits({ daily_lesson_target: { min: 1, default: 4, max: 10 } });

  const effective = await getKidEffectiveLimits(child.id);
  assert.equal(effective.daily_lesson_target, 10, 'stale override above the new max must clamp down to max');
});

// ─── Streak ──────────────────────────────────────────────────────────────────

test('bumpStreakOnLessonCompleted: first-ever completion sets streak=1', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  const result = await bumpStreakOnLessonCompleted(child.id);

  assert.equal(result.streak_days, 1);
  assert.equal(result.longest_streak_days, 1);
  assert.equal(result.last_lesson_date, new Date().toISOString().slice(0, 10));
});

test('bumpStreakOnLessonCompleted: a same-day repeat does not double-count', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  await bumpStreakOnLessonCompleted(child.id);
  const second = await bumpStreakOnLessonCompleted(child.id);

  assert.equal(second.streak_days, 1, 'completing a second lesson the same day must not bump the streak again');
});

test('bumpStreakOnLessonCompleted: a consecutive day increments the streak and raises the longest record', async () => {
  const parent = await createParent(prisma);
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const child = await createChild(prisma, {
    parentId: parent.id,
    streakDays: 5,
    longestStreakDays: 5,
    lastLessonDate: yesterday,
  });

  const result = await bumpStreakOnLessonCompleted(child.id);

  assert.equal(result.streak_days, 6);
  assert.equal(result.longest_streak_days, 6);
});

test('bumpStreakOnLessonCompleted: a gap of 2+ days resets the current streak but preserves the longest record', async () => {
  const parent = await createParent(prisma);
  const threeDaysAgo = new Date();
  threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
  const child = await createChild(prisma, {
    parentId: parent.id,
    streakDays: 5,
    longestStreakDays: 9,
    lastLessonDate: threeDaysAgo,
  });

  const result = await bumpStreakOnLessonCompleted(child.id);

  assert.equal(result.streak_days, 1, 'a gap resets the current streak');
  assert.equal(result.longest_streak_days, 9, 'the longest record must never shrink');
});
