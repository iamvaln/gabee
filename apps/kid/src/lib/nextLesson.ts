import type { ChildProfile, LevelProgress, Module, QuestionBundleResponse } from '@gabee/types';
import { findLevelProgress, lessonsForLevel, sortedUnique, unitsForLevel } from './progression';
import { readLocalTrack } from './codeTrack';

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
      // Translation is per-DIRECTION AND per-language. `subMode` carries the
      // direction SLUG ('fr-en' / 'en-fr'); the progress key uses the underscore
      // infix ('translation_fr_en' / 'translation_en_fr'). Mirrors the words case.
      if (!subMode) return [];
      const key = `translation_${subMode.replace('-', '_')}` as keyof typeof profile.progress_by_module_per_language;
      const track = profile.progress_by_module_per_language[key];
      return track?.[lang]?.levels ?? [];
    }
    case 'code': {
      // Code keeps its progression in localStorage per world (maze / draw /
      // actions), NOT in the synced progress_by_module.code track — see
      // lib/codeTrack.ts. Read from there so the road shows the stars the
      // kid actually earned.
      if (!subMode) return [];
      return readLocalTrack(`code.${subMode}`, profile.id).levels;
    }
    case 'numbers':
    case 'keyboard': {
      const track = profile.progress_by_module[module] as unknown as TrackWithSubMode | undefined;
      if (subMode) return track?.bySubMode?.[subMode]?.levels ?? [];
      return track?.levels ?? [];
    }
    default:
      return [];
  }
}

// Sub-hub tile "Reprendre · Niveau N" / "Commencer" / "Done" hint —
// shared between every *Hub.tsx so the same words land in front of the kid
// regardless of which strand they're looking at. The kind drives the tile
// chip; level is only meaningful for 'resume'.
export type SubModeHint =
  | { kind: 'start' }
  | { kind: 'resume'; level: number }
  | { kind: 'done' };

/**
 * Compute the resume hint for a sub-hub tile. Returns:
 *  - 'start' when the kid has never earned a star in this strand (or has no
 *    next lesson but no progress either — first-time view).
 *  - 'resume' + the level number when the kid has played at least one
 *    lesson here and isn't yet 3-starred everywhere.
 *  - 'done' when nextLessonFor returns null (every unit is 3-starred).
 */
export function subModeHint(
  bundle: QuestionBundleResponse | undefined | null,
  profile: ChildProfile,
  module: Module,
  subMode: string | null,
  lang: Lang,
): SubModeHint {
  const levels = getProgressLevels(profile, module, subMode, lang);
  const hasProgress = levels.some((lvl) =>
    lvl.lessons.some((l) => l.stars >= 1),
  );
  const next = pickNextLesson(bundle, levels, subMode);
  if (!next) {
    return hasProgress ? { kind: 'done' } : { kind: 'start' };
  }
  return hasProgress
    ? { kind: 'resume', level: next.level }
    : { kind: 'start' };
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
