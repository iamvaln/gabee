/**
 * Monotonic, loss-free merge of two progress snapshots (product §8 fix).
 *
 * Progress is cumulative — stars, plays, unlocked levels and earned badges only
 * ever GROW. The original sync clobbered the server value with whatever a device
 * last pushed (last-write-wins), so a stale device (e.g. a second tablet that
 * synced before the first device's gains landed) could DROP a kid's points. That
 * is the multi-device regression we're fixing.
 *
 * These helpers combine two trees taking the better of each leaf:
 *   - stars / plays / highest_level → max
 *   - best_time_s                   → min (lower time is better; null = none)
 *   - last_played                   → max (latest ISO timestamp)
 *   - seen_question_ids             → set union
 *   - levels / lessons              → merged by id (max per matching leaf)
 * The result is never lower than either input on any field, so a merge can only
 * preserve or improve progress — never regress it.
 */
import type {
  LessonProgress,
  LevelProgress,
  ProgressByModule,
  ProgressByModulePerLanguage,
  TrackProgress,
} from '@gabee/types';

/** Later of two nullable ISO timestamps (ISO-8601 sorts lexicographically). */
function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/** Smaller of two nullable numbers (for best_time_s — lower is better). */
function minNullable(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function mergeLesson(a: LessonProgress, b: LessonProgress): LessonProgress {
  return {
    lesson: a.lesson,
    stars: Math.max(a.stars, b.stars),
    plays: Math.max(a.plays, b.plays),
    last_played: maxIso(a.last_played, b.last_played),
  };
}

function mergeLevel(a: LevelProgress, b: LevelProgress): LevelProgress {
  const byLesson = new Map<number, LessonProgress>();
  for (const ls of [...a.lessons, ...b.lessons]) {
    const ex = byLesson.get(ls.lesson);
    byLesson.set(ls.lesson, ex ? mergeLesson(ex, ls) : ls);
  }
  return {
    level: a.level,
    stars: Math.max(a.stars, b.stars),
    plays: Math.max(a.plays, b.plays),
    best_time_s: minNullable(a.best_time_s, b.best_time_s),
    last_played: maxIso(a.last_played, b.last_played),
    seen_question_ids: [...new Set([...a.seen_question_ids, ...b.seen_question_ids])],
    lessons: [...byLesson.values()].sort((x, y) => x.lesson - y.lesson),
  };
}

/** Merge two single-track progress trees (highest level + per-level detail). */
export function mergeTrack(a: TrackProgress, b: TrackProgress): TrackProgress {
  const byLevel = new Map<number, LevelProgress>();
  for (const lv of [...a.levels, ...b.levels]) {
    const ex = byLevel.get(lv.level);
    byLevel.set(lv.level, ex ? mergeLevel(ex, lv) : lv);
  }
  return {
    highest_level: Math.max(a.highest_level, b.highest_level),
    levels: [...byLevel.values()].sort((x, y) => x.level - y.level),
  };
}

/** Merge the language-agnostic tracks (numbers / keyboard / code). */
export function mergeProgressByModule(a: ProgressByModule, b: ProgressByModule): ProgressByModule {
  return {
    numbers: mergeTrack(a.numbers, b.numbers),
    keyboard: mergeTrack(a.keyboard, b.keyboard),
    code: mergeTrack(a.code, b.code),
  };
}

/** Merge the per-language tracks (words_* + translation, each fr + en). */
export function mergeProgressByModulePerLanguage(
  a: ProgressByModulePerLanguage,
  b: ProgressByModulePerLanguage,
): ProgressByModulePerLanguage {
  const pair = (k: keyof ProgressByModulePerLanguage) => ({
    fr: mergeTrack(a[k].fr, b[k].fr),
    en: mergeTrack(a[k].en, b[k].en),
  });
  return {
    words_picture: pair('words_picture'),
    words_fill: pair('words_fill'),
    words_build: pair('words_build'),
    words_read: pair('words_read'),
    translation: pair('translation'),
  };
}
