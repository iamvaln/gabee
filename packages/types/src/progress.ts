import { z } from 'zod';
import {
  AvatarSchema,
  GenderSchema,
  HairColorSchema,
  HairStyleSchema,
  LanguageSchema,
  LessonSchema,
  LevelSchema,
  ShirtColorSchema,
  SkinToneSchema,
  StarsSchema,
} from './enums';

/** A level = 3 lessons + 1 revision (product §4.0). Revision is the reserved lesson 4. */
export const REVISION_LESSON = 4;

/** Per-lesson progress within a level (drives lesson gating + level completion). */
export const LessonProgressSchema = z.object({
  /** Real lesson number for the 3 lessons; `REVISION_LESSON` (4) for the revision. */
  lesson: LessonSchema,
  stars: StarsSchema,
  plays: z.number().int().min(0).default(0),
  last_played: z.iso.datetime().nullable().default(null),
});
export type LessonProgress = z.infer<typeof LessonProgressSchema>;

/**
 * Per-level progress for one track (product §7.3). `seen_question_ids` biases
 * sampling away from recently-seen questions (product §5); `lessons` tracks each
 * lesson + revision so a level is "complete" only when all its units are passed.
 */
export const LevelProgressSchema = z.object({
  level: LevelSchema,
  stars: StarsSchema,
  plays: z.number().int().min(0).default(0),
  best_time_s: z.number().min(0).nullable().default(null),
  last_played: z.iso.datetime().nullable().default(null),
  seen_question_ids: z.array(z.string()).default([]),
  lessons: z.array(LessonProgressSchema).default([]),
});
export type LevelProgress = z.infer<typeof LevelProgressSchema>;

/** Progress within a single track: the highest unlocked level + per-level detail. */
export const TrackProgressSchema = z.object({
  highest_level: LevelSchema,
  levels: z.array(LevelProgressSchema).default([]),
});
export type TrackProgress = z.infer<typeof TrackProgressSchema>;

/** Language-AGNOSTIC modules: one track each (product §7.3). */
export const ProgressByModuleSchema = z.object({
  numbers: TrackProgressSchema,
  keyboard: TrackProgressSchema,
  code: TrackProgressSchema,
});
export type ProgressByModule = z.infer<typeof ProgressByModuleSchema>;

/** A pair of tracks (FR + EN) for a language-dependent module. */
export const PerLanguageTrackSchema = z.object({
  fr: TrackProgressSchema,
  en: TrackProgressSchema,
});
export type PerLanguageTrack = z.infer<typeof PerLanguageTrackSchema>;

/** Language-DEPENDENT modules: progress tracked separately per language (product §7.3). */
export const ProgressByModulePerLanguageSchema = z.object({
  words_picture: PerLanguageTrackSchema,
  words_fill: PerLanguageTrackSchema,
  words_build: PerLanguageTrackSchema,
  words_read: PerLanguageTrackSchema,
  translation: PerLanguageTrackSchema,
});
export type ProgressByModulePerLanguage = z.infer<typeof ProgressByModulePerLanguageSchema>;

/** A fresh, empty track (level 1 unlocked, no plays yet). */
export function emptyTrackProgress(): TrackProgress {
  return { highest_level: 1, levels: [] };
}

/** Default language-agnostic progress for a new profile. */
export function defaultProgressByModule(): ProgressByModule {
  return {
    numbers: emptyTrackProgress(),
    keyboard: emptyTrackProgress(),
    code: emptyTrackProgress(),
  };
}

/** Default per-language progress for a new profile (fr + en empty on every track). */
export function defaultProgressByModulePerLanguage(): ProgressByModulePerLanguage {
  const pair = (): PerLanguageTrack => ({ fr: emptyTrackProgress(), en: emptyTrackProgress() });
  return {
    words_picture: pair(),
    words_fill: pair(),
    words_build: pair(),
    words_read: pair(),
    translation: pair(),
  };
}

/**
 * Child profile (product §7.3). The DTO shape returned by the API — a child profile
 * has no login of its own; the parent's auth gates the kid device.
 *
 * `name` is the child's REAL first name (set by the parent); there is no character
 * naming. The in-app/Code protagonist is Gabee the mascot, not the avatar (product §3).
 */
export const ChildProfileSchema = z.object({
  id: z.uuid(),
  parent_id: z.uuid(),
  name: z.string().min(2).max(20),
  /** Legacy fixed-look id. Null on rows created after the recolour system;
   *  kept for back-compat, not written anymore. Prefer the 3 dims below. */
  avatar: AvatarSchema.nullable().default(null),
  /** Recolourable look — independently-picked dimensions. Backfilled on
   *  existing rows from the legacy avatar, so always present post-migration. */
  skin_tone: SkinToneSchema,
  hair_color: HairColorSchema,
  hair_style: HairStyleSchema,
  shirt_color: ShirtColorSchema,
  /** Chosen by the parent; null = unspecified → renders as the boy face. */
  gender: GenderSchema.nullable().default(null),
  /** Active language; switchable anytime, no locked primary (product §2). */
  language: LanguageSchema,
  /** ISO date (YYYY-MM-DD) collected at add-kid; drives age-based content
   *  selection. Nullable for profiles created before the field existed. */
  birth_date: z.iso.date().nullable().default(null),
  audio_enabled: z.boolean().default(true),
  created_at: z.iso.datetime(),
  last_active_at: z.iso.datetime().nullable().default(null),
  total_stars: z.number().int().min(0).default(0),
  badges: z.array(z.string()).default([]),
  progress_by_module: ProgressByModuleSchema,
  progress_by_module_per_language: ProgressByModulePerLanguageSchema,
});
export type ChildProfile = z.infer<typeof ChildProfileSchema>;

/**
 * Parent account (product §7.3) — public DTO. Auth (password) lives in the
 * history-capable ParentCredential table (own auth, scrypt + jose), never here.
 * `role` distinguishes regular parents from admins so the login flow can route
 * post-auth (admin spec §2; single-auth roles).
 */
import { AccountRoleSchema } from './api/admin';
export const ParentAccountSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: AccountRoleSchema,
  created_at: z.iso.datetime(),
  last_login_at: z.iso.datetime().nullable().default(null),
  children: z.array(ChildProfileSchema).max(3).default([]),
});
export type ParentAccount = z.infer<typeof ParentAccountSchema>;
