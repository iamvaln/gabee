import test from 'node:test';
import assert from 'node:assert/strict';
import type { LinkedInPost, TikTokPost } from '@gabee/types';
import { checkArtDirection, checkPostRules, checkTikTokMode, checkWeekTitles, findUrls, LINK_RESERVE_CHARS } from './post-rules';

const linkedin = { rules: { max_chars: 3000, hashtags_min: 3, hashtags_max: 5, link_policy: 'in_body', emoji_policy: '≤ 2' } };
const tiktok = { rules: { max_chars: 2200, hashtags_min: 3, hashtags_max: 6, link_policy: 'bio_only', emoji_policy: '≤ 3' } };

const li = (over: Partial<LinkedInPost> = {}): LinkedInPost => ({
  body: 'Votre enfant apprend à compter en jouant.',
  hashtags: ['#Gabee', '#Éducation', '#Parents'],
  link_target: 'signup',
  ...over,
});
const tt = (over: Partial<TikTokPost> = {}): TikTokPost => ({
  caption: 'Une minute de calcul avec Gabee. Lien en bio !',
  hashtags: ['#Gabee', '#Maths', '#Parents'],
  on_screen_text: ['3 + 4 ?', 'Bravo !'],
  mode: 'filming_plan',
  filming_plan: { hook: "L'écran du jeu", shots: ['Écran du module Nombres', 'Gabee qui applaudit'], duration_s: 20 },
  ...over,
});

test('valid posts have no violations', () => {
  assert.deepEqual(checkPostRules('linkedin', li(), linkedin), []);
  assert.deepEqual(checkPostRules('tiktok', tt(), tiktok), []);
  // library_video without a plan is the Art director's job, not a violation here.
  assert.deepEqual(checkPostRules('tiktok', tt({ mode: 'library_video', filming_plan: undefined }), tiktok), []);
});

test('post outputs violating platform rules are invalid', () => {
  // Review Focus 3: a 3,001-char LinkedIn body.
  const long = checkPostRules('linkedin', li({ body: 'a'.repeat(3001) }), linkedin);
  assert.ok(long.some((v) => /3001/.test(v) && /3000/.test(v)), long.join(' | '));

  // TikTok filming_plan mode without a plan (schema-bypassing object).
  const noPlan = checkPostRules('tiktok', { ...tt(), filming_plan: undefined } as TikTokPost, tiktok);
  assert.ok(noPlan.some((v) => /filming_plan/.test(v)), noPlan.join(' | '));
  const emptyShots = checkPostRules('tiktok', tt({ filming_plan: { hook: 'x', shots: [], duration_s: 20 } }), tiktok);
  assert.ok(emptyShots.some((v) => /shots/.test(v)), emptyShots.join(' | '));

  // A URL the agent wrote itself — third party or Gabee — is refused (Ruling 5).
  const bitly = checkPostRules('tiktok', tt({ caption: 'Regardez http://bit.ly/x' }), tiktok);
  assert.ok(bitly.some((v) => /bit\.ly/.test(v)), bitly.join(' | '));
  const gabee = checkPostRules('linkedin', li({ body: 'Inscrivez-vous sur https://parents.gabee.app/signup' }), linkedin);
  assert.ok(gabee.some((v) => /URL/.test(v)), gabee.join(' | '));
  assert.ok(checkPostRules('linkedin', li({ body: 'Voir www.example.com' }), linkedin).length > 0);
  assert.ok(checkPostRules('tiktok', tt({ on_screen_text: ['gabee.app'] }), tiktok).length > 0);
  assert.ok(checkPostRules('tiktok', tt({ filming_plan: { hook: 'bit.ly/abc', shots: ['a'], duration_s: 10 } }), tiktok).length > 0);
  assert.ok(checkPostRules('linkedin', li({ hashtags: ['#a', '#b', 'https://x.com'] }), linkedin).length > 0);

  // Hashtag count outside the profile's range, and malformed hashtags.
  assert.ok(checkPostRules('linkedin', li({ hashtags: ['#a', '#b'] }), linkedin).some((v) => /hashtag/i.test(v)));
  assert.ok(checkPostRules('tiktok', tt({ hashtags: ['#a', '#b', '#c', '#d', '#e', '#f', '#g'] }), tiktok).some((v) => /hashtag/i.test(v)));
  assert.ok(checkPostRules('linkedin', li({ hashtags: ['#a', 'b', '#c d'] }), linkedin).some((v) => /hashtag/i.test(v)));
});

test('linkedin length keeps room for hashtags and the appended link', () => {
  const tags = li().hashtags.join(' ').length + 2;
  const fits = 3000 - LINK_RESERVE_CHARS - tags;
  assert.deepEqual(checkPostRules('linkedin', li({ body: 'a'.repeat(fits) }), linkedin), []);
  assert.equal(checkPostRules('linkedin', li({ body: 'a'.repeat(fits + 1) }), linkedin).length, 1);
  // TikTok: no link is appended (bio only) — caption + hashtags within 2,200.
  const ttTags = tt().hashtags.join(' ').length + 2;
  assert.deepEqual(checkPostRules('tiktok', tt({ caption: 'a'.repeat(2200 - ttTags) }), tiktok), []);
  assert.equal(checkPostRules('tiktok', tt({ caption: 'a'.repeat(2201 - ttTags) }), tiktok).length, 1);
});

test('broken platform rules are reported, not ignored', () => {
  assert.throws(() => checkPostRules('linkedin', li(), { rules: { max_chars: 'lots' } }), /rules/);
});

test('findUrls spots schemes, www and bare domains but not prose', () => {
  assert.deepEqual(findUrls('Voir https://gabee.app/fr et bit.ly/x, ou www.foo.org.'), ['https://gabee.app/fr', 'bit.ly/x', 'www.foo.org']);
  assert.deepEqual(findUrls("C'est fini.Le jeu continue, p. ex. le module Nombres, 3.5 étoiles, e.g. Mots."), []);
});

test('findUrls catches any host with a path and bare domains on any TLD', () => {
  for (const url of ['wa.me/33612345678', 't.me/x', 'lnkd.in/abc', 'amzn.to/x', 'is.gd/x', 'rb.gy/x', 'bit.ly', 'example.museum', 'www.foo.co', 'GABEE.APP']) {
    assert.deepEqual(findUrls(`Écrivez-nous sur ${url} !`), [url], url);
  }
  assert.deepEqual(findUrls('Rendez-vous sur Gabee.app?'), ['Gabee.app']);
  assert.deepEqual(findUrls('contact@gabee.app'), ['gabee.app']);
  // Rejected through the post rules too (Ruling 5: any URL the agent wrote).
  assert.ok(checkPostRules('linkedin', li({ body: 'Parlons-en sur lnkd.in/abc' }), linkedin).some((v) => /lnkd\.in/.test(v)));
  assert.ok(checkPostRules('tiktok', tt({ caption: 'Écrivez sur wa.me/336' }), tiktok).some((v) => /wa\.me/.test(v)));
});

test('findUrls leaves ordinary prose alone', () => {
  for (const prose of ['Version 2.0 est là', '3.5 étoiles', 'M. Dupont arrive.', 'e.g. le module Mots', 'i.e. Nombres', 'U.S. schools', 'Note : 4.5/5', "C'est fini.Le jeu continue", 'v2.0/beta']) {
    assert.deepEqual(findUrls(prose), [], prose);
  }
});

test('checkTikTokMode refuses library_video when no cleared vertical video exists', () => {
  assert.equal(checkTikTokMode(tt({ mode: 'library_video', filming_plan: undefined }), 0).length, 1);
  assert.deepEqual(checkTikTokMode(tt({ mode: 'library_video', filming_plan: undefined }), 2), []);
  assert.deepEqual(checkTikTokMode(tt(), 0), []);
});

test('checkArtDirection only accepts a listed asset of the right shape', () => {
  const media = [
    { id: '11111111-1111-4111-8111-111111111111', kind: 'video', aspect: '9:16' },
    { id: '22222222-2222-4222-8222-222222222222', kind: 'image', aspect: '16:9' },
  ];
  assert.deepEqual(checkArtDirection({ media_asset_id: null, visual_brief: 'x' }, 'tiktok', media), []);
  assert.deepEqual(checkArtDirection({ media_asset_id: media[0]!.id, visual_brief: 'x' }, 'tiktok', media), []);
  assert.deepEqual(checkArtDirection({ media_asset_id: media[1]!.id, visual_brief: 'x' }, 'linkedin', media), []);
  assert.equal(checkArtDirection({ media_asset_id: media[1]!.id, visual_brief: 'x' }, 'tiktok', media).length, 1);
  assert.equal(
    checkArtDirection({ media_asset_id: '33333333-3333-4333-8333-333333333333', visual_brief: 'x' }, 'linkedin', media).length,
    1,
  );
  assert.equal(checkArtDirection({ media_asset_id: null, visual_brief: '  ' }, 'linkedin', media).length, 1);
});

test('checkArtDirection follows the shared platform rule (Ruling 16)', () => {
  const asset = (id: string, kind: string, aspect: string | null) => ({ id, kind, aspect });
  const media = [
    asset('44444444-4444-4444-8444-444444444444', 'image', '4:5'),
    asset('55555555-5555-4555-8555-555555555555', 'image', '9:16'),
    asset('66666666-6666-4666-8666-666666666666', 'video', null),
    asset('77777777-7777-4777-8777-777777777777', 'video', '16:9'),
  ];
  const pick = (i: number, platform: 'linkedin' | 'tiktok') => checkArtDirection({ media_asset_id: media[i]!.id, visual_brief: 'x' }, platform, media);
  assert.deepEqual(pick(0, 'linkedin'), [], 'LinkedIn takes 4:5');
  assert.match(pick(1, 'linkedin')[0] ?? '', /16:9, 1:1 or 4:5/);
  assert.equal(pick(2, 'linkedin').length, 1, 'a video of unknown aspect does not fit');
  assert.match(pick(3, 'tiktok')[0] ?? '', /vertical \(9:16\) video/);
});

test('checkWeekTitles requires exactly the planned dates and platforms', () => {
  const day = (date: string) => ({
    date,
    topic: 't',
    angle: 'a',
    format: 'story' as const,
    platforms: [
      { platform: 'linkedin' as const, language: 'fr' as const },
      { platform: 'tiktok' as const, language: 'en' as const },
    ],
    sources: [],
  });
  const dates = ['2026-10-27', '2026-10-28'];
  assert.deepEqual(checkWeekTitles({ days: dates.map(day) }, dates, ['linkedin', 'tiktok']), []);
  assert.equal(checkWeekTitles({ days: [day('2026-10-27')] }, dates, ['linkedin', 'tiktok']).length, 1);
  assert.equal(checkWeekTitles({ days: [day('2026-10-28'), day('2026-10-27')] }, dates, ['linkedin', 'tiktok']).length, 1);
  assert.equal(checkWeekTitles({ days: dates.map(day) }, dates, ['linkedin']).length, 2);
});
