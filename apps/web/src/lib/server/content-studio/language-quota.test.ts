import test from 'node:test';
import assert from 'node:assert/strict';
import type { ContentLanguage, ContentPlatform } from '@gabee/types';
import { checkLanguageQuota, englishRequired } from './language-quota';

type Post = [ContentPlatform, ContentLanguage];
const day = (...posts: Post[]) => ({ platforms: posts.map(([platform, language]) => ({ platform, language })) });

// The default cadence: LinkedIn Tue–Thu (3 posts), TikTok Mon/Wed/Fri/Sun (4 posts).
const fullWeek = (linkedinEn: number, tiktokEn: number) => {
  const li = (i: number): Post => ['linkedin', i < linkedinEn ? 'en' : 'fr'];
  const tt = (i: number): Post => ['tiktok', i < tiktokEn ? 'en' : 'fr'];
  return [day(tt(0)), day(li(0)), day(li(1), tt(1)), day(li(2)), day(tt(2)), day(tt(3))];
};

test('englishRequired: 1 per platform per week; a partial week asks it only from 2 posts', () => {
  assert.equal(englishRequired(3, false), 1);
  assert.equal(englishRequired(1, false), 1);
  assert.equal(englishRequired(0, false), 0, 'a platform that posts nothing this week has nothing to translate');
  assert.equal(englishRequired(2, true), 1);
  assert.equal(englishRequired(5, true), 1);
  assert.equal(englishRequired(1, true), 0);
  assert.equal(englishRequired(0, true), 0);
});

test('a full week needs one English post per platform, never two', () => {
  assert.deepEqual(checkLanguageQuota(fullWeek(1, 1), false), [
    { platform: 'linkedin', posts: 3, english: 1, required: 1, ok: true },
    { platform: 'tiktok', posts: 4, english: 1, required: 1, ok: true },
  ]);
  assert.deepEqual(
    checkLanguageQuota(fullWeek(0, 2), false).map((r) => [r.platform, r.english, r.required, r.ok]),
    [
      ['linkedin', 0, 1, false],
      ['tiktok', 2, 1, true],
    ],
  );
});

test('a partial week: 1 English post only for a platform with at least 2 posts in the window', () => {
  // Started on a Thursday: Fri (TikTok) and Sun (TikTok) remain; LinkedIn posts nothing.
  const fromFriday = [day(['tiktok', 'fr']), day(['tiktok', 'fr'])];
  assert.deepEqual(checkLanguageQuota(fromFriday, true), [
    { platform: 'linkedin', posts: 0, english: 0, required: 0, ok: true },
    { platform: 'tiktok', posts: 2, english: 0, required: 1, ok: false },
  ]);
  // Started on a Wednesday: Thu (LinkedIn), Fri and Sun (TikTok): one LinkedIn post needs no English.
  const fromThursday = [day(['linkedin', 'fr']), day(['tiktok', 'en']), day(['tiktok', 'fr'])];
  assert.deepEqual(
    checkLanguageQuota(fromThursday, true).map((r) => [r.platform, r.posts, r.required, r.ok]),
    [
      ['linkedin', 1, 0, true],
      ['tiktok', 2, 1, true],
    ],
  );
});

test('checkLanguageQuota only checks the given platforms', () => {
  assert.deepEqual(checkLanguageQuota([day(['linkedin', 'en'])], false, ['linkedin']), [{ platform: 'linkedin', posts: 1, english: 1, required: 1, ok: true }]);
});
