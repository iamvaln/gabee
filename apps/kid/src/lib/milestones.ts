import type { ChildProfile, KidStreakState } from '@gabee/types';

// Auto-unlocked milestones (Coffre tab). All purely DERIVED — we recompute
// from profile + streak state on every render, so there's no persistence
// concern. Adding a new milestone is one entry in MILESTONES; the Coffre
// screen lists everything and lights up what's unlocked.
//
// The `predicate` is the only logic: it answers "is this unlocked yet?".
// Anything we count (lessons completed, distinct modules played, total
// stars) should already live on the profile — if a new milestone needs a
// new signal, the right move is to surface that signal up to the profile
// shape first, not push a side-channel into here.

export interface MilestoneDef {
  id: string;
  icon: string; // emoji — kids read pictures before words
  title: { fr: string; en: string };
  description: { fr: string; en: string };
  /** Returns true once unlocked. Purely derived from profile + streak. */
  predicate: (ctx: MilestoneCtx) => boolean;
}

export interface MilestoneCtx {
  profile: ChildProfile;
  streak: KidStreakState;
  lessonsCompleted: number;
  distinctModulesPlayed: number;
}

function lessonsCompleted(profile: ChildProfile): number {
  let total = 0;
  // Walk every track + every per-language track. `lessons[].plays >= 1`
  // means the lesson was attempted; we want COMPLETED-once (≥1 star).
  const visit = (levels: { lessons: { stars: number }[] }[]) => {
    for (const lvl of levels) {
      for (const lesson of lvl.lessons) {
        if (lesson.stars >= 1) total += 1;
      }
    }
  };
  visit(profile.progress_by_module.numbers.levels);
  visit(profile.progress_by_module.keyboard.levels);
  visit(profile.progress_by_module.code.levels);
  const lp = profile.progress_by_module_per_language;
  for (const lang of ['fr', 'en'] as const) {
    visit(lp.words_picture[lang].levels);
    visit(lp.words_fill[lang].levels);
    visit(lp.words_build[lang].levels);
    visit(lp.words_read[lang].levels);
    visit(lp.translation_fr_en[lang].levels);
    visit(lp.translation_en_fr[lang].levels);
  }
  return total;
}

function distinctModulesPlayed(profile: ChildProfile): number {
  const set = new Set<string>();
  const note = (key: string, levels: { lessons: { stars: number }[] }[]) => {
    for (const lvl of levels) for (const lesson of lvl.lessons) if (lesson.stars >= 1) { set.add(key); return; }
  };
  note('numbers', profile.progress_by_module.numbers.levels);
  note('keyboard', profile.progress_by_module.keyboard.levels);
  note('code', profile.progress_by_module.code.levels);
  const lp = profile.progress_by_module_per_language;
  for (const lang of ['fr', 'en'] as const) {
    note('words', lp.words_picture[lang].levels);
    note('words', lp.words_fill[lang].levels);
    note('words', lp.words_build[lang].levels);
    note('words', lp.words_read[lang].levels);
    note('translation', lp.translation_fr_en[lang].levels);
    note('translation', lp.translation_en_fr[lang].levels);
  }
  return set.size;
}

export const MILESTONES: MilestoneDef[] = [
  {
    id: 'first_lesson',
    icon: '🌱',
    title: { fr: 'Premier pas', en: 'First step' },
    description: { fr: 'Tu as terminé ta toute première leçon.', en: 'You finished your very first lesson.' },
    predicate: (c) => c.lessonsCompleted >= 1,
  },
  {
    id: 'ten_lessons',
    icon: '🌿',
    title: { fr: '10 leçons', en: '10 lessons' },
    description: { fr: 'Tu as terminé 10 leçons.', en: 'You finished 10 lessons.' },
    predicate: (c) => c.lessonsCompleted >= 10,
  },
  {
    id: 'fifty_lessons',
    icon: '🌳',
    title: { fr: '50 leçons', en: '50 lessons' },
    description: { fr: 'Tu as terminé 50 leçons. Bravo !', en: 'You finished 50 lessons. Bravo!' },
    predicate: (c) => c.lessonsCompleted >= 50,
  },
  {
    id: 'hundred_lessons',
    icon: '🏛️',
    title: { fr: '100 leçons', en: '100 lessons' },
    description: { fr: 'Tu as terminé 100 leçons. Incroyable !', en: 'You finished 100 lessons. Incredible!' },
    predicate: (c) => c.lessonsCompleted >= 100,
  },
  {
    id: 'star_collector',
    icon: '⭐',
    title: { fr: '100 étoiles', en: '100 stars' },
    description: { fr: 'Tu as gagné 100 étoiles.', en: 'You earned 100 stars.' },
    predicate: (c) => c.profile.total_stars >= 100,
  },
  {
    id: 'star_master',
    icon: '🌟',
    title: { fr: '500 étoiles', en: '500 stars' },
    description: { fr: 'Tu as gagné 500 étoiles. Tu brilles !', en: 'You earned 500 stars. You shine!' },
    predicate: (c) => c.profile.total_stars >= 500,
  },
  {
    id: 'first_streak',
    icon: '🔥',
    title: { fr: 'Série de 3 jours', en: '3-day streak' },
    description: { fr: 'Tu es venu jouer 3 jours d’affilée.', en: 'You played 3 days in a row.' },
    predicate: (c) => c.streak.streak_days >= 3 || c.streak.longest_streak_days >= 3,
  },
  {
    id: 'week_streak',
    icon: '🔥🔥',
    title: { fr: 'Série de 7 jours', en: '7-day streak' },
    description: { fr: 'Tu es venu jouer 7 jours d’affilée.', en: 'You played 7 days in a row.' },
    predicate: (c) => c.streak.streak_days >= 7 || c.streak.longest_streak_days >= 7,
  },
  {
    id: 'month_streak',
    icon: '🔥🔥🔥',
    title: { fr: 'Série de 30 jours', en: '30-day streak' },
    description: { fr: 'Tu es venu jouer 30 jours d’affilée.', en: 'You played 30 days in a row.' },
    predicate: (c) => c.streak.streak_days >= 30 || c.streak.longest_streak_days >= 30,
  },
  {
    id: 'polyglot',
    icon: '🗺️',
    title: { fr: 'Explorateur', en: 'Explorer' },
    description: {
      fr: 'Tu as joué dans au moins 3 modules différents.',
      en: 'You played in at least 3 different modules.',
    },
    predicate: (c) => c.distinctModulesPlayed >= 3,
  },
];

export function evaluateMilestones(
  profile: ChildProfile,
  streak: KidStreakState,
): { unlocked: MilestoneDef[]; locked: MilestoneDef[] } {
  const ctx: MilestoneCtx = {
    profile,
    streak,
    lessonsCompleted: lessonsCompleted(profile),
    distinctModulesPlayed: distinctModulesPlayed(profile),
  };
  const unlocked: MilestoneDef[] = [];
  const locked: MilestoneDef[] = [];
  for (const m of MILESTONES) (m.predicate(ctx) ? unlocked : locked).push(m);
  return { unlocked, locked };
}
