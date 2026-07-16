import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sortedUnique,
  lessonsForLevel,
  unitsForLevel,
  findLevelProgress,
  unitPassed,
  levelComplete,
} from './progression';

// Minimal LevelProgress/LessonProgress fixtures (only the fields these fns read).
function lesson(n: number, stars: number) {
  return { lesson: n, stars, plays: 1, last_played: null };
}
function lvl(level: number, lessons: ReturnType<typeof lesson>[]) {
  return { level, stars: 0, plays: 0, best_time_s: null, last_played: null, seen_question_ids: [], lessons };
}

describe('sortedUnique', () => {
  it('dedupes and sorts ascending', () => {
    assert.deepEqual(sortedUnique([3, 1, 2, 1, 3]), [1, 2, 3]);
    assert.deepEqual(sortedUnique([]), []);
  });
});

describe('lessonsForLevel', () => {
  it('returns [1,2,3] when the level has any question, else []', () => {
    const qs = [{ level: 1 }, { level: 1 }, { level: 2 }];
    assert.deepEqual(lessonsForLevel(qs, 1), [1, 2, 3]);
    assert.deepEqual(lessonsForLevel(qs, 2), [1, 2, 3]);
    assert.deepEqual(lessonsForLevel(qs, 3), []); // no questions at level 3
  });
});

describe('unitsForLevel', () => {
  it('appends a revision unit only when there are >= 2 lessons', () => {
    assert.deepEqual(unitsForLevel([1, 2, 3]), [
      { lesson: 1, isRevision: false },
      { lesson: 2, isRevision: false },
      { lesson: 3, isRevision: false },
      { lesson: 4, isRevision: true },
    ]);
    assert.deepEqual(unitsForLevel([1]), [{ lesson: 1, isRevision: false }]); // no revision
    assert.deepEqual(unitsForLevel([]), []); // no lessons, no revision
  });
});

describe('findLevelProgress', () => {
  it('finds by level or returns undefined', () => {
    const levels = [lvl(1, []), lvl(2, [])];
    assert.equal(findLevelProgress(levels, 2)?.level, 2);
    assert.equal(findLevelProgress(levels, 9), undefined);
  });
});

describe('unitPassed (>= 1 star gate)', () => {
  it('is true at 1 star, false at 0', () => {
    const levels = [lvl(1, [lesson(1, 1), lesson(2, 0)])];
    assert.equal(unitPassed(levels, 1, 1), true);
    assert.equal(unitPassed(levels, 1, 2), false);
    assert.equal(unitPassed(levels, 1, 3), false); // missing lesson row → 0 stars
    assert.equal(unitPassed(levels, 9, 1), false); // missing level
  });
});

describe('levelComplete', () => {
  it('is true only when every unit is passed (>= 1 star each)', () => {
    const units = unitsForLevel([1, 2, 3]); // lessons 1,2,3 + revision 4
    const allPassed = [lvl(1, [lesson(1, 1), lesson(2, 2), lesson(3, 1), lesson(4, 1)])];
    const oneMissing = [lvl(1, [lesson(1, 1), lesson(2, 2), lesson(3, 1), lesson(4, 0)])];
    assert.equal(levelComplete(allPassed, 1, units), true);
    assert.equal(levelComplete(oneMissing, 1, units), false);
    assert.equal(levelComplete(allPassed, 1, []), false); // empty units → not complete
  });
});
