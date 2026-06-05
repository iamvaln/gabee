import { REVISION_LESSON, type LevelProgress } from '@gabee/types';

// A level is played as a sequence of units: its configured lessons, then a revision
// (only when there are ≥ 2 lessons to mix). A unit is "passed" once it has ≥ 1 star;
// a level is "complete" when every unit is passed → that unlocks the next level.

export interface PlayUnit {
  lesson: number; // real lesson number, or REVISION_LESSON for the revision
  isRevision: boolean;
}

export function sortedUnique(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

// Curriculum v0.1 (seed-schema principle 4): the data holds ONE pool per
// (module, sub_mode, level) — every question is `lesson: 1`. The lesson layer
// (3 lessons + a revision) is SYNTHESISED app-side: each unit samples the
// level's pool. So a level with any content always offers 3 lessons + revision,
// regardless of the `lesson` field on the rows.
export const LESSONS_PER_LEVEL = 3;

/** The synthesised lesson numbers for a level: 1..3 when the level has a pool. */
export function lessonsForLevel(
  questions: { level: number }[],
  level: number,
): number[] {
  const hasPool = questions.some((q) => q.level === level);
  return hasPool ? Array.from({ length: LESSONS_PER_LEVEL }, (_, i) => i + 1) : [];
}

/** The ordered play units for a level: lessons, then a revision if ≥ 2 lessons. */
export function unitsForLevel(lessonNums: number[]): PlayUnit[] {
  const units: PlayUnit[] = lessonNums.map((lesson) => ({ lesson, isRevision: false }));
  if (lessonNums.length >= 2) units.push({ lesson: REVISION_LESSON, isRevision: true });
  return units;
}

export function findLevelProgress(levels: LevelProgress[], level: number): LevelProgress | undefined {
  return levels.find((l) => l.level === level);
}

export function unitPassed(levels: LevelProgress[], level: number, lesson: number): boolean {
  const lp = findLevelProgress(levels, level);
  return !!lp?.lessons.some((x) => x.lesson === lesson && x.stars >= 1);
}

export function levelComplete(levels: LevelProgress[], level: number, units: PlayUnit[]): boolean {
  return units.length > 0 && units.every((u) => unitPassed(levels, level, u.lesson));
}
