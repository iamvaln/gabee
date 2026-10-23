import test from 'node:test';
import assert from 'node:assert/strict';
import type { ContentLanguage, ContentPlatform } from '@gabee/types';
import { checkLanguageQuota } from './language-quota';

const day = (linkedin: ContentLanguage, tiktok: ContentLanguage) => ({
  platforms: [
    { platform: 'linkedin' as ContentPlatform, language: linkedin },
    { platform: 'tiktok' as ContentPlatform, language: tiktok },
  ],
});

test('checkLanguageQuota requires 1 per platform on a 4-day week', () => {
  const slots = [day('en', 'fr'), day('fr', 'en'), day('fr', 'fr'), day('fr', 'fr')];
  assert.deepEqual(checkLanguageQuota(slots, 4), [
    { platform: 'linkedin', english: 1, required: 1, ok: true },
    { platform: 'tiktok', english: 1, required: 1, ok: true },
  ]);
  const short = checkLanguageQuota([day('en', 'fr'), day('fr', 'fr')], 2);
  assert.deepEqual(
    short.map((r) => [r.platform, r.ok]),
    [
      ['linkedin', true],
      ['tiktok', false],
    ],
  );
});

test('checkLanguageQuota requires 2 per platform from a 5-day week', () => {
  const slots = [day('en', 'en'), day('en', 'fr'), day('fr', 'fr'), day('fr', 'fr'), day('fr', 'fr')];
  assert.deepEqual(checkLanguageQuota(slots, 5), [
    { platform: 'linkedin', english: 2, required: 2, ok: true },
    { platform: 'tiktok', english: 1, required: 2, ok: false },
  ]);
});

test('checkLanguageQuota only checks the given platforms', () => {
  const slots = [{ platforms: [{ platform: 'linkedin' as ContentPlatform, language: 'en' as ContentLanguage }] }];
  assert.deepEqual(checkLanguageQuota(slots, 1, ['linkedin']), [{ platform: 'linkedin', english: 1, required: 1, ok: true }]);
});
