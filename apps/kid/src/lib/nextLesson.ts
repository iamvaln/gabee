import type { ChildProfile, LevelProgress, Module, QuestionBundleResponse } from '@gabee/types';
import { findLevelProgress, lessonsForLevel, sortedUnique, unitsForLevel } from './progression';

// Auto-pick the next lesson to play for a (module, subMode) pair. Same
// algorithm everywhere: walk configured levels in order, return the first
// unit (lesson or revision) that isn't yet 3-starred. If everything is
// 3-starred → return null and the UI shows the "tu as tout fait" state.
//
// "Configured levels" = the distinct levels that have published questions
// for this sub-mode in the bundle. Empty bundles → null.

export interface NextLesson {
  level: number;
  lesson: number;
  isRevision: boolean;
}

interface BundleLike {
  questions: { level: number; sub_mode?: string }[];
}

function poolForSubMode(bundle: BundleLike, subMode: string | null): BundleLike['questions'] {
  if (!subMode) return bundle.questions;
  return bundle.questions.filter((q) => q.sub_mode === subMode);
}

/**
 * Pick the next playable lesson for the (module, sub-mode) track. Returns
 * null when the bundle has no published questions for the filter OR when
 * every unit is already 3-starred.
 */
export function pickNextLesson(
  bundle: BundleLike | undefined | null,
  levels: LevelProgress[],
  subMode: string | null = null,
): NextLesson | null {
  if (!bundle) return null;
  const pool = poolForSubMode(bundle, subMode);
  if (pool.length === 0) return null;
  const configured = sortedUnique(pool.map((q) => q.level));
  for (const level of configured) {
    const units = unitsForLevel(lessonsForLevel(pool, level));
    const lp = findLevelProgress(levels, level);
    for (const u of units) {
      const stars = lp?.lessons.find((x) => x.lesson === u.lesson)?.stars ?? 0;
      if (stars < 3) return { level, lesson: u.lesson, isRevision: u.isRevision };
    }
  }
  return null;
}

// ─── Per-(module, sub-mode) progress accessor ─────────────────────────────
// Centralises the per-module quirks (Words/Translation are per-language;
// Numbers/Keyboard/Code use a single track with a `bySubMode` extension)
// so callers don't repeat the cast everywhere.

type Lang = 'fr' | 'en';

interface TrackWithSubMode {
  highest_level: number;
  levels: LevelProgress[];
  bySubMode?: Record<string, { levels: LevelProgress[] }>;
}

export function getProgressLevels(
  profile: ChildProfile,
  module: Module,
  subMode: string | null,
  lang: Lang,
): LevelProgress[] {
  switch (module) {
    case 'words': {
      // Words is per-sub-mode AND per-language. The keys mirror the schema:
      // `words_picture` / `words_fill` / `words_build` / `words_read`.
      if (!subMode) return [];
      const key = `words_${subMode}` as keyof typeof profile.progress_by_module_per_language;
      const track = profile.progress_by_module_per_language[key];
      return track?.[lang]?.levels ?? [];
    }
    case 'translation': {
      const track = profile.progress_by_module_per_language.translation;
      return track?.[lang]?.levels ?? [];
    }
    case 'numbers':
    case 'keyboard':
    case 'code': {
      const track = profile.progress_by_module[module] as unknown as TrackWithSubMode | undefined;
      if (subMode) return track?.bySubMode?.[subMode]?.levels ?? [];
      return track?.levels ?? [];
    }
    default:
      return [];
  }
}

/**
 * Convenience wrapper: auto-pick directly from the profile + the bundle the
 * caller already has. Returns the same NextLesson shape, or null when the
 * sub-mode is locked / fully mastered.
 */
export function nextLessonFor(
  bundle: QuestionBundleResponse | undefined | null,
  profile: ChildProfile,
  module: Module,
  subMode: string | null,
  lang: Lang,
): NextLesson | null {
  const levels = getProgressLevels(profile, module, subMode, lang);
  return pickNextLesson(bundle, levels, subMode);
}
