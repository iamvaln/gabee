import { z } from 'zod';

/**
 * Healthy-use limits + per-kid overrides + streak shape (product §6.3).
 * Admin defines a triplet (min, default, max) per parameter via a singleton
 * `HealthyUseLimits` row. Parents pick a value per kid within [min, max];
 * `null` on a kid override means "inherit the admin default". The kid app
 * resolves the effective value at runtime.
 *
 * "Not a game, it's learning" — defaults are higher than typical screen-time
 * apps (60 min soft, 120 min hard, 180 min daily cumul, 4 lessons/day).
 */

const MinDefaultMaxIntSchema = z.object({
  min: z.number().int().min(0),
  default: z.number().int().min(0),
  max: z.number().int().min(0),
});
const MinDefaultMaxSecSchema = MinDefaultMaxIntSchema;

export const HealthyUseLimitsSchema = z.object({
  daily_lesson_target: MinDefaultMaxIntSchema,
  session_soft_limit_min: MinDefaultMaxIntSchema,
  session_hard_cap_min: MinDefaultMaxIntSchema,
  daily_total_cap_min: MinDefaultMaxIntSchema,
  look_away_interval_min: z.number().int().min(1),
  look_away_pause_sec: z.number().int().min(5),
  look_away_enabled_default: z.boolean(),
  streak_enabled: z.boolean(),
  badges_enabled: z.boolean(),
});
export type HealthyUseLimits = z.infer<typeof HealthyUseLimitsSchema>;

/** PATCH /api/admin/healthy-use-limits — partial update, super_admin only. */
export const UpdateHealthyUseLimitsRequestSchema = z
  .object({
    daily_lesson_target: MinDefaultMaxIntSchema.partial(),
    session_soft_limit_min: MinDefaultMaxIntSchema.partial(),
    session_hard_cap_min: MinDefaultMaxIntSchema.partial(),
    daily_total_cap_min: MinDefaultMaxIntSchema.partial(),
    look_away_interval_min: z.number().int().min(1),
    look_away_pause_sec: z.number().int().min(5),
    look_away_enabled_default: z.boolean(),
    streak_enabled: z.boolean(),
    badges_enabled: z.boolean(),
  })
  .partial();
export type UpdateHealthyUseLimitsRequest = z.infer<typeof UpdateHealthyUseLimitsRequestSchema>;

/** Per-kid overrides — `null` means inherit the admin default. */
export const KidLimitsOverridesSchema = z.object({
  daily_lesson_target: z.number().int().min(0).nullable(),
  session_soft_limit_min: z.number().int().min(0).nullable(),
  session_hard_cap_min: z.number().int().min(0).nullable(),
  daily_total_cap_min: z.number().int().min(0).nullable(),
  look_away_enabled: z.boolean().nullable(),
});
export type KidLimitsOverrides = z.infer<typeof KidLimitsOverridesSchema>;

/** PATCH /api/parent/kids/[id]/limits — partial override update. */
export const UpdateKidLimitsRequestSchema = KidLimitsOverridesSchema.partial();
export type UpdateKidLimitsRequest = z.infer<typeof UpdateKidLimitsRequestSchema>;

/**
 * Effective resolved limits for ONE kid — what the kid app reads from
 * `/api/kid/effective-limits`. Each value is `override ?? adminDefault`.
 */
export const KidEffectiveLimitsSchema = z.object({
  daily_lesson_target: z.number().int().min(0),
  session_soft_limit_min: z.number().int().min(0),
  session_hard_cap_min: z.number().int().min(0),
  daily_total_cap_min: z.number().int().min(0),
  look_away_interval_min: z.number().int().min(1),
  look_away_pause_sec: z.number().int().min(5),
  look_away_enabled: z.boolean(),
  streak_enabled: z.boolean(),
  badges_enabled: z.boolean(),
});
export type KidEffectiveLimits = z.infer<typeof KidEffectiveLimitsSchema>;

// ─── Streak + badges ─────────────────────────────────────────────────────────

export const KidStreakStateSchema = z.object({
  streak_days: z.number().int().min(0),
  longest_streak_days: z.number().int().min(0),
  last_lesson_date: z.iso.date().nullable(),
});
export type KidStreakState = z.infer<typeof KidStreakStateSchema>;

/** Canonical badge ids the kid app + admin agree on. Add new ones over time. */
export const BadgeIdSchema = z.enum([
  // Module mastery (per level)
  'numbers_l1_master', 'numbers_l4_master', 'numbers_l7_master',
  'words_picture_l1_master', 'words_fill_l1_master', 'words_build_l1_master', 'words_read_l1_master',
  'keyboard_static_l1_master', 'keyboard_scrolling_l1_master',
  'code_find_path_l1_master', 'code_building_blocks_l1_master',
  'translation_l1_master',
  // Volume
  'lessons_10', 'lessons_50', 'lessons_100', 'lessons_500',
  // Bilingual
  'bilingual_starter', 'bilingual_confirmed',
  // Consistency
  'streak_3', 'streak_7', 'streak_14', 'streak_30', 'streak_100',
  // Special
  'first_lesson_completed',
]);
export type BadgeId = z.infer<typeof BadgeIdSchema>;
