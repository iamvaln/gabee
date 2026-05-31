import {
  HealthyUseLimitsSchema,
  KidEffectiveLimitsSchema,
  type HealthyUseLimits,
  type KidEffectiveLimits,
  type KidLimitsOverrides,
  type UpdateHealthyUseLimitsRequest,
  type UpdateKidLimitsRequest,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';

/**
 * Healthy-use limits (product §6.3, decided 2026-05-30/31). Two-tier:
 *  - Admin singleton `healthy_use_limits` with min/default/max triplets per
 *    parameter. Default row id = 'default'; seeded at migration time.
 *  - Per-kid overrides on `child_profiles` (nullable columns). Null = inherit.
 *
 * The kid app calls `getKidEffectiveLimits(kidId)` once on profile select; the
 * resolved object resolves every override to a concrete value within the admin
 * bounds (and clamped if a stale override is now out of range).
 */

const SINGLETON_ID = 'default';

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Read the admin singleton; falls back to product defaults if the row is missing. */
export async function getAdminLimits(): Promise<HealthyUseLimits> {
  const row = await prisma.healthyUseLimits.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) {
    // Shouldn't happen — the migration seeds the row — but return sane defaults
    // so admin-only callers don't 500.
    return HealthyUseLimitsSchema.parse({
      daily_lesson_target: { min: 1, default: 4, max: 12 },
      session_soft_limit_min: { min: 30, default: 60, max: 120 },
      session_hard_cap_min: { min: 45, default: 120, max: 180 },
      daily_total_cap_min: { min: 60, default: 180, max: 300 },
      look_away_interval_min: 10,
      look_away_pause_sec: 20,
      look_away_enabled_default: true,
      streak_enabled: true,
      badges_enabled: true,
    });
  }
  return HealthyUseLimitsSchema.parse({
    daily_lesson_target: {
      min: row.dailyLessonTargetMin,
      default: row.dailyLessonTargetDefault,
      max: row.dailyLessonTargetMax,
    },
    session_soft_limit_min: {
      min: row.sessionSoftLimitMinMin,
      default: row.sessionSoftLimitMinDefault,
      max: row.sessionSoftLimitMinMax,
    },
    session_hard_cap_min: {
      min: row.sessionHardCapMinMin,
      default: row.sessionHardCapMinDefault,
      max: row.sessionHardCapMinMax,
    },
    daily_total_cap_min: {
      min: row.dailyTotalCapMinMin,
      default: row.dailyTotalCapMinDefault,
      max: row.dailyTotalCapMinMax,
    },
    look_away_interval_min: row.lookAwayIntervalMin,
    look_away_pause_sec: row.lookAwayPauseSec,
    look_away_enabled_default: row.lookAwayEnabledDefault,
    streak_enabled: row.streakEnabled,
    badges_enabled: row.badgesEnabled,
  });
}

/**
 * Partial update of the admin singleton. Validates that every (min,default,max)
 * triplet preserves min ≤ default ≤ max post-update.
 */
export async function updateAdminLimits(req: UpdateHealthyUseLimitsRequest): Promise<HealthyUseLimits> {
  const cur = await getAdminLimits();
  const merged: HealthyUseLimits = {
    daily_lesson_target: { ...cur.daily_lesson_target, ...(req.daily_lesson_target ?? {}) },
    session_soft_limit_min: { ...cur.session_soft_limit_min, ...(req.session_soft_limit_min ?? {}) },
    session_hard_cap_min: { ...cur.session_hard_cap_min, ...(req.session_hard_cap_min ?? {}) },
    daily_total_cap_min: { ...cur.daily_total_cap_min, ...(req.daily_total_cap_min ?? {}) },
    look_away_interval_min: req.look_away_interval_min ?? cur.look_away_interval_min,
    look_away_pause_sec: req.look_away_pause_sec ?? cur.look_away_pause_sec,
    look_away_enabled_default: req.look_away_enabled_default ?? cur.look_away_enabled_default,
    streak_enabled: req.streak_enabled ?? cur.streak_enabled,
    badges_enabled: req.badges_enabled ?? cur.badges_enabled,
  };
  for (const key of ['daily_lesson_target', 'session_soft_limit_min', 'session_hard_cap_min', 'daily_total_cap_min'] as const) {
    const t = merged[key];
    if (t.min > t.default || t.default > t.max) {
      throw new HttpError(400, 'invalid_triplet', `Invalid triplet for ${key}: min ≤ default ≤ max required.`);
    }
  }

  await prisma.healthyUseLimits.update({
    where: { id: SINGLETON_ID },
    data: {
      dailyLessonTargetMin: merged.daily_lesson_target.min,
      dailyLessonTargetDefault: merged.daily_lesson_target.default,
      dailyLessonTargetMax: merged.daily_lesson_target.max,
      sessionSoftLimitMinMin: merged.session_soft_limit_min.min,
      sessionSoftLimitMinDefault: merged.session_soft_limit_min.default,
      sessionSoftLimitMinMax: merged.session_soft_limit_min.max,
      sessionHardCapMinMin: merged.session_hard_cap_min.min,
      sessionHardCapMinDefault: merged.session_hard_cap_min.default,
      sessionHardCapMinMax: merged.session_hard_cap_min.max,
      dailyTotalCapMinMin: merged.daily_total_cap_min.min,
      dailyTotalCapMinDefault: merged.daily_total_cap_min.default,
      dailyTotalCapMinMax: merged.daily_total_cap_min.max,
      lookAwayIntervalMin: merged.look_away_interval_min,
      lookAwayPauseSec: merged.look_away_pause_sec,
      lookAwayEnabledDefault: merged.look_away_enabled_default,
      streakEnabled: merged.streak_enabled,
      badgesEnabled: merged.badges_enabled,
    },
  });
  return merged;
}

/** Read the per-kid override row (all null = inherits everything). */
export async function getKidLimitsOverrides(kidId: string): Promise<KidLimitsOverrides> {
  const row = await prisma.childProfile.findUnique({
    where: { id: kidId },
    select: {
      dailyLessonTargetOverride: true,
      sessionSoftLimitMinOverride: true,
      sessionHardCapMinOverride: true,
      dailyTotalCapMinOverride: true,
      lookAwayEnabledOverride: true,
    },
  });
  if (!row) throw new HttpError(404, 'kid_not_found', `Kid ${kidId} not found.`);
  return {
    daily_lesson_target: row.dailyLessonTargetOverride,
    session_soft_limit_min: row.sessionSoftLimitMinOverride,
    session_hard_cap_min: row.sessionHardCapMinOverride,
    daily_total_cap_min: row.dailyTotalCapMinOverride,
    look_away_enabled: row.lookAwayEnabledOverride,
  };
}

/**
 * Update per-kid overrides. Each numeric override must fit within the admin's
 * [min, max] triplet for that field — clamp client-side first, but the server
 * enforces too so a malicious or stale client can't escape.
 */
export async function updateKidLimitsOverrides(
  kidId: string,
  req: UpdateKidLimitsRequest,
): Promise<KidLimitsOverrides> {
  const admin = await getAdminLimits();

  function within(key: 'daily_lesson_target' | 'session_soft_limit_min' | 'session_hard_cap_min' | 'daily_total_cap_min', value: number | null | undefined) {
    if (value == null) return;
    const t = admin[key];
    if (value < t.min || value > t.max) {
      throw new HttpError(400, 'override_out_of_range', `${key}=${value} is outside admin bounds [${t.min},${t.max}].`);
    }
  }
  within('daily_lesson_target', req.daily_lesson_target);
  within('session_soft_limit_min', req.session_soft_limit_min);
  within('session_hard_cap_min', req.session_hard_cap_min);
  within('daily_total_cap_min', req.daily_total_cap_min);

  const data: Record<string, number | boolean | null> = {};
  if ('daily_lesson_target' in req) data.dailyLessonTargetOverride = req.daily_lesson_target ?? null;
  if ('session_soft_limit_min' in req) data.sessionSoftLimitMinOverride = req.session_soft_limit_min ?? null;
  if ('session_hard_cap_min' in req) data.sessionHardCapMinOverride = req.session_hard_cap_min ?? null;
  if ('daily_total_cap_min' in req) data.dailyTotalCapMinOverride = req.daily_total_cap_min ?? null;
  if ('look_away_enabled' in req) data.lookAwayEnabledOverride = req.look_away_enabled ?? null;

  await prisma.childProfile.update({ where: { id: kidId }, data });
  return getKidLimitsOverrides(kidId);
}

/**
 * Resolve every limit to a concrete value: `override ?? admin.default`, clamped
 * to the admin's [min, max] window so a stale override after an admin tightens
 * the bounds doesn't escape. The kid app reads this on profile select and
 * caches it for the session.
 */
export async function getKidEffectiveLimits(kidId: string): Promise<KidEffectiveLimits> {
  const [admin, overrides] = await Promise.all([getAdminLimits(), getKidLimitsOverrides(kidId)]);
  const resolved: KidEffectiveLimits = {
    daily_lesson_target: clamp(
      overrides.daily_lesson_target ?? admin.daily_lesson_target.default,
      admin.daily_lesson_target.min,
      admin.daily_lesson_target.max,
    ),
    session_soft_limit_min: clamp(
      overrides.session_soft_limit_min ?? admin.session_soft_limit_min.default,
      admin.session_soft_limit_min.min,
      admin.session_soft_limit_min.max,
    ),
    session_hard_cap_min: clamp(
      overrides.session_hard_cap_min ?? admin.session_hard_cap_min.default,
      admin.session_hard_cap_min.min,
      admin.session_hard_cap_min.max,
    ),
    daily_total_cap_min: clamp(
      overrides.daily_total_cap_min ?? admin.daily_total_cap_min.default,
      admin.daily_total_cap_min.min,
      admin.daily_total_cap_min.max,
    ),
    look_away_interval_min: admin.look_away_interval_min,
    look_away_pause_sec: admin.look_away_pause_sec,
    look_away_enabled: overrides.look_away_enabled ?? admin.look_away_enabled_default,
    streak_enabled: admin.streak_enabled,
    badges_enabled: admin.badges_enabled,
  };
  return KidEffectiveLimitsSchema.parse(resolved);
}

/**
 * Server-side streak recompute on lesson_completed (product §6.3 — clock-
 * manipulation prevention). Compares the kid's `lastLessonDate` against today:
 *  - same day: streak unchanged
 *  - yesterday: streak += 1
 *  - any other: streak resets to 1
 * Always sets `lastLessonDate = today`. Returns the new streak state.
 */
export async function bumpStreakOnLessonCompleted(kidId: string): Promise<{
  streak_days: number;
  longest_streak_days: number;
  last_lesson_date: string;
}> {
  const row = await prisma.childProfile.findUnique({
    where: { id: kidId },
    select: { streakDays: true, longestStreakDays: true, lastLessonDate: true },
  });
  if (!row) throw new HttpError(404, 'kid_not_found', `Kid ${kidId} not found.`);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  let streak = row.streakDays;
  if (row.lastLessonDate == null) {
    streak = 1;
  } else {
    const last = new Date(row.lastLessonDate);
    last.setUTCHours(0, 0, 0, 0);
    const diffDays = Math.round((todayMs - last.getTime()) / 86_400_000);
    if (diffDays === 0) {
      // Already counted today — no bump.
    } else if (diffDays === 1) {
      streak = streak + 1;
    } else {
      streak = 1;
    }
  }
  const longest = Math.max(row.longestStreakDays, streak);
  await prisma.childProfile.update({
    where: { id: kidId },
    data: {
      streakDays: streak,
      longestStreakDays: longest,
      lastLessonDate: today,
    },
  });
  return {
    streak_days: streak,
    longest_streak_days: longest,
    last_lesson_date: today.toISOString().slice(0, 10),
  };
}
