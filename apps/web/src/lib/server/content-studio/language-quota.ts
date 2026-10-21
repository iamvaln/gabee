import { CONTENT_PLATFORMS, type ContentLanguage, type ContentPlatform } from '@gabee/types';

export type LanguageQuotaResult = { platform: ContentPlatform; english: number; required: number; ok: boolean };

/**
 * English minimum per platform over a week (Global Constraints): at least 2
 * English posts per platform on a week of 5 days or more, at least 1 on a
 * partial week of 4 days or fewer. The owner may override (the UI flags it).
 *
 * Callers pass only the slots that will be posted — skipped days do not count.
 */
export function checkLanguageQuota(
  slots: ReadonlyArray<{ platforms: ReadonlyArray<{ platform: ContentPlatform; language: ContentLanguage }> }>,
  daysInWeek: number,
  platforms: readonly ContentPlatform[] = CONTENT_PLATFORMS,
): LanguageQuotaResult[] {
  const required = daysInWeek <= 4 ? 1 : 2;
  return platforms.map((platform) => {
    const english = slots.filter((s) => s.platforms.some((p) => p.platform === platform && p.language === 'en')).length;
    return { platform, english, required, ok: english >= required };
  });
}
