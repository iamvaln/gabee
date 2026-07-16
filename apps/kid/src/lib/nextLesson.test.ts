import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { QuestionBundleResponse } from '@gabee/types';
import { pickNextLesson, subModeHint, nextLessonFor } from './nextLesson';

// `sub_mode` optional (not nullable) to match BundleLike's `sub_mode?: string`.
function q(level: number, sub_mode?: string) {
  return { level, sub_mode, id: `q-${level}-${sub_mode ?? 'x'}-${Math.random()}` };
}
function lesson(n: number, stars: number) {
  return { lesson: n, stars, plays: 1, last_played: null };
}
function lvl(level: number, lessons: ReturnType<typeof lesson>[]) {
  return { level, stars: 0, plays: 0, best_time_s: null, last_played: null, seen_question_ids: [], lessons };
}

describe('pickNextLesson', () => {
  it('returns null for a null bundle or an empty (sub-mode-filtered) pool', () => {
    assert.equal(pickNextLesson(null, []), null);
    assert.equal(pickNextLesson({ questions: [q(1, 'picture')] }, [], 'fill'), null); // no 'fill' questions
  });

  it('fresh progress → first unit of the lowest configured level', () => {
    const bundle = { questions: [q(1), q(1), q(2)] };
    assert.deepEqual(pickNextLesson(bundle, []), { level: 1, lesson: 1, isRevision: false });
  });

  it('skips units that are fully 3-starred, within a level, in unit order', () => {
    const bundle = { questions: [q(1)] };
    const levels = [lvl(1, [lesson(1, 3), lesson(2, 1)])]; // L1 lesson1 mastered, lesson2 not
    assert.deepEqual(pickNextLesson(bundle, levels), { level: 1, lesson: 2, isRevision: false });
  });

  it('is LEVEL-FIRST: an unfinished lower level is chosen before a higher one', () => {
    const bundle = { questions: [q(1), q(2)] };
    const levels = [lvl(1, [lesson(1, 0)]), lvl(2, [lesson(1, 0)])];
    assert.equal(pickNextLesson(bundle, levels)!.level, 1); // never jumps to level 2 while level 1 is open
  });

  it('advances to the next level only once every unit of the lower level is 3-starred', () => {
    const bundle = { questions: [q(1), q(2)] };
    // L1 lessons 1,2,3 + revision(4) all at 3 stars → L1 fully mastered
    const levels = [lvl(1, [lesson(1, 3), lesson(2, 3), lesson(3, 3), lesson(4, 3)]), lvl(2, [lesson(1, 0)])];
    assert.deepEqual(pickNextLesson(bundle, levels), { level: 2, lesson: 1, isRevision: false });
  });

  it('returns null when every unit of every configured level is 3-starred', () => {
    const bundle = { questions: [q(1)] };
    const levels = [lvl(1, [lesson(1, 3), lesson(2, 3), lesson(3, 3), lesson(4, 3)])];
    assert.equal(pickNextLesson(bundle, levels), null);
  });

  it('the revision unit (lesson 4) is the last one picked in a level', () => {
    const bundle = { questions: [q(1)] };
    const levels = [lvl(1, [lesson(1, 3), lesson(2, 3), lesson(3, 3), lesson(4, 0)])];
    assert.deepEqual(pickNextLesson(bundle, levels), { level: 1, lesson: 4, isRevision: true });
  });

  it('an unfinished revision at a level blocks advancing to a higher configured level', () => {
    const bundle = { questions: [q(1), q(2)] }; // levels 1 and 2 both configured
    // L1 lessons 1-3 mastered, revision (lesson 4) NOT → must stay on L1's revision, never jump to L2
    const levels = [lvl(1, [lesson(1, 3), lesson(2, 3), lesson(3, 3), lesson(4, 0)]), lvl(2, [lesson(1, 0)])];
    assert.deepEqual(pickNextLesson(bundle, levels), { level: 1, lesson: 4, isRevision: true });
  });
});

describe('subModeHint', () => {
  const bundle = { questions: [q(1, 'picture')] } as unknown as QuestionBundleResponse;
  const profileWith = (lessons: ReturnType<typeof lesson>[]) =>
    ({
      id: 'p1',
      progress_by_module_per_language: { words_picture: { fr: { highest_level: 1, levels: lessons.length ? [lvl(1, lessons)] : [] }, en: { highest_level: 1, levels: [] } } },
    }) as never;

  it("'start' when there is no progress", () => {
    assert.deepEqual(subModeHint(bundle, profileWith([]), 'words', 'picture', 'fr'), { kind: 'start' });
  });
  it("'resume' with the level when progress exists and more remains", () => {
    assert.deepEqual(subModeHint(bundle, profileWith([lesson(1, 1)]), 'words', 'picture', 'fr'), { kind: 'resume', level: 1 });
  });
  it("'done' when there is progress and nothing remains (all 3-starred)", () => {
    const full = [lesson(1, 3), lesson(2, 3), lesson(3, 3), lesson(4, 3)];
    assert.deepEqual(subModeHint(bundle, profileWith(full), 'words', 'picture', 'fr'), { kind: 'done' });
  });
});

describe('nextLessonFor', () => {
  it('reads the words per-language track and delegates to pickNextLesson', () => {
    const bundle = { questions: [q(1, 'picture')] } as unknown as QuestionBundleResponse;
    const profile = {
      id: 'p1',
      progress_by_module_per_language: { words_picture: { fr: { highest_level: 1, levels: [lvl(1, [lesson(1, 3), lesson(2, 0)])] }, en: { highest_level: 1, levels: [] } } },
    } as never;
    assert.deepEqual(nextLessonFor(bundle, profile, 'words', 'picture', 'fr'), { level: 1, lesson: 2, isRevision: false });
  });
});
