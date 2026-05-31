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

/** Distinct lesson numbers configured for a level, from the bundle's questions. */
export function lessonsForLevel(
  questions: { level: number; lesson: number }[],
  level: number,
): number[] {
  return sortedUnique(questions.filter((q) => q.level === level).map((q) => q.lesson));
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
