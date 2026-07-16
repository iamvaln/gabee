import type { BadgeId, ChildProfile, KidStreakState } from '@gabee/types';

/**
 * Badges (product §6.3 — consistency framing, not FOMO). Pure client compute:
 * given the profile snapshot (progress + total_stars) and the streak state,
 * return the set of badge ids the kid has earned. Pure → idempotent → cheap to
 * call from anywhere. Newly-earned badges = compute the delta since the last
 * Summary screen.
 */

const STREAK_TIERS = [3, 7, 14, 30, 100] as const;
const VOLUME_TIERS: { stars: number; id: BadgeId }[] = [
  { stars: 10, id: 'lessons_10' },
  { stars: 50, id: 'lessons_50' },
  { stars: 100, id: 'lessons_100' },
  { stars: 500, id: 'lessons_500' },
];

export function earnedBadges(profile: ChildProfile, streak: KidStreakState): Set<BadgeId> {
  const out = new Set<BadgeId>();

  if (profile.total_stars > 0) out.add('first_lesson_completed');

  for (const tier of VOLUME_TIERS) {
    if (profile.total_stars >= tier.stars) out.add(tier.id);
  }

  for (const tier of STREAK_TIERS) {
    if (streak.streak_days >= tier) out.add(`streak_${tier}` as BadgeId);
  }

  // Module mastery: 3 stars on the canonical level for each module/sub-mode.
  // Numbers L1 mastery (3 stars on L1 across all lessons).
  const numbersL1 = profile.progress_by_module.numbers?.levels?.find((l) => l.level === 1);
  if (numbersL1 && numbersL1.stars >= 3) out.add('numbers_l1_master');
  const numbersL4 = profile.progress_by_module.numbers?.levels?.find((l) => l.level === 4);
  if (numbersL4 && numbersL4.stars >= 3) out.add('numbers_l4_master');
  const numbersL7 = profile.progress_by_module.numbers?.levels?.find((l) => l.level === 7);
  if (numbersL7 && numbersL7.stars >= 3) out.add('numbers_l7_master');

  // Words / per sub-mode L1 mastery (3 stars on L1 in EITHER language track).
  const perLang = profile.progress_by_module_per_language;
  type Track = { levels?: { level: number; stars: number }[] };
  function bestL1(pair: { fr: Track; en: Track }): number {
    const a = pair.fr?.levels?.find((l) => l.level === 1)?.stars ?? 0;
    const b = pair.en?.levels?.find((l) => l.level === 1)?.stars ?? 0;
    return Math.max(a, b);
  }
  if (bestL1(perLang.words_picture) >= 3) out.add('words_picture_l1_master');
  if (bestL1(perLang.words_fill) >= 3) out.add('words_fill_l1_master');
  if (bestL1(perLang.words_build) >= 3) out.add('words_build_l1_master');
  if (bestL1(perLang.words_read) >= 3) out.add('words_read_l1_master');
  // Translation is now two per-direction tracks; the single L1 badge fires when
  // EITHER direction reaches L1 mastery (product: one translation badge).
  if (bestL1(perLang.translation_fr_en) >= 3 || bestL1(perLang.translation_en_fr) >= 3)
    out.add('translation_l1_master');

  // Bilingual: starter = both FR and EN have at least one star anywhere;
  // confirmed = both have ≥10 stars cumulative across all word sub-modes + translation.
  function sumStarsForLang(lang: 'fr' | 'en'): number {
    let s = 0;
    for (const trackName of ['words_picture', 'words_fill', 'words_build', 'words_read', 'translation_fr_en', 'translation_en_fr'] as const) {
      const t = perLang[trackName]?.[lang];
      for (const lvl of t?.levels ?? []) s += lvl.stars;
    }
    return s;
  }
  const fr = sumStarsForLang('fr');
  const en = sumStarsForLang('en');
  if (fr > 0 && en > 0) out.add('bilingual_starter');
  if (fr >= 10 && en >= 10) out.add('bilingual_confirmed');

  return out;
}

/** Stable display label per badge id (FR/EN). */
export const BADGE_LABELS: Record<BadgeId, { fr: string; en: string; icon: string }> = {
  first_lesson_completed: { fr: 'Première leçon', en: 'First lesson', icon: '🌱' },
  lessons_10: { fr: '10 leçons', en: '10 lessons', icon: '⭐' },
  lessons_50: { fr: '50 leçons', en: '50 lessons', icon: '🌟' },
  lessons_100: { fr: '100 leçons', en: '100 lessons', icon: '💯' },
  lessons_500: { fr: '500 leçons', en: '500 lessons', icon: '🏆' },
  streak_3: { fr: '3 jours d’affilée', en: '3-day streak', icon: '🔥' },
  streak_7: { fr: '7 jours d’affilée', en: '7-day streak', icon: '🔥' },
  streak_14: { fr: '14 jours d’affilée', en: '14-day streak', icon: '🔥' },
  streak_30: { fr: '30 jours d’affilée', en: '30-day streak', icon: '🔥' },
  streak_100: { fr: '100 jours d’affilée', en: '100-day streak', icon: '👑' },
  bilingual_starter: { fr: 'Bilingue débutant', en: 'Bilingual starter', icon: '🌍' },
  bilingual_confirmed: { fr: 'Bilingue confirmé', en: 'Bilingual confirmed', icon: '🌐' },
  numbers_l1_master: { fr: 'Chiffres N1', en: 'Numbers L1', icon: '🔢' },
  numbers_l4_master: { fr: 'Chiffres N4', en: 'Numbers L4', icon: '🔢' },
  numbers_l7_master: { fr: 'Chiffres N7', en: 'Numbers L7', icon: '🔢' },
  words_picture_l1_master: { fr: 'Image N1', en: 'Picture L1', icon: '🖼️' },
  words_fill_l1_master: { fr: 'Remplir N1', en: 'Fill L1', icon: '✏️' },
  words_build_l1_master: { fr: 'Construire N1', en: 'Build L1', icon: '🧱' },
  words_read_l1_master: { fr: 'Lire N1', en: 'Read L1', icon: '📖' },
  keyboard_static_l1_master: { fr: 'Clavier N1', en: 'Keyboard L1', icon: '⌨️' },
  keyboard_scrolling_l1_master: { fr: 'Clavier rapide', en: 'Speed typing', icon: '💨' },
  code_find_path_l1_master: { fr: 'Code N1', en: 'Code L1', icon: '🧭' },
  code_building_blocks_l1_master: { fr: 'Boucles N1', en: 'Loops L1', icon: '🔁' },
  translation_l1_master: { fr: 'Traduction N1', en: 'Translation L1', icon: '🔄' },
};

function lsKey(profileId: string): string {
  return `gabee.kid.badges.seen.${profileId}`;
}

export function readSeenBadges(profileId: string | null): Set<BadgeId> {
  if (!profileId || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(lsKey(profileId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as BadgeId[]);
  } catch {
    return new Set();
  }
}

export function writeSeenBadges(profileId: string, set: Set<BadgeId>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(lsKey(profileId), JSON.stringify([...set]));
  } catch {
    // best-effort
  }
}

/** Earned now \ seen before = newly-earned. */
export function newlyEarned(
  profile: ChildProfile,
  streak: KidStreakState,
  seen: Set<BadgeId>,
): BadgeId[] {
  const now = earnedBadges(profile, streak);
  const out: BadgeId[] = [];
  for (const id of now) if (!seen.has(id)) out.push(id);
  return out;
}
