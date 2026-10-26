import { CONTENT_PLATFORMS, type ContentLanguage, type ContentPlatform } from '@gabee/types';

export type LanguageQuotaResult = {
  platform: ContentPlatform;
  /** Days this platform posts on (skipped days excluded). */
  posts: number;
  english: number;
  required: number;
  ok: boolean;
};

/**
 * English posts a platform needs over a week (owner decision 2026-10-26): at
 * least 1 per platform per week. On a partial week (started mid-way), only a
 * platform with 2 posts or more in the window needs one. A platform that posts
 * nothing this week needs none.
 */
export function englishRequired(posts: number, partial: boolean): number {
  if (posts === 0) return 0;
  return partial && posts < 2 ? 0 : 1;
}

/**
 * The English minimum per platform over a week. The owner may override it
 * (the UI flags it).
 *
 * Callers pass only the slots that will be posted — skipped days do not count.
 */
export function checkLanguageQuota(
  slots: ReadonlyArray<{ platforms: ReadonlyArray<{ platform: ContentPlatform; language: ContentLanguage }> }>,
  partial: boolean,
  platforms: readonly ContentPlatform[] = CONTENT_PLATFORMS,
): LanguageQuotaResult[] {
  return platforms.map((platform) => {
    const posted = slots.flatMap((s) => s.platforms.filter((p) => p.platform === platform));
    const english = posted.filter((p) => p.language === 'en').length;
    const required = englishRequired(posted.length, partial);
    return { platform, posts: posted.length, english, required, ok: english >= required };
  });
}
