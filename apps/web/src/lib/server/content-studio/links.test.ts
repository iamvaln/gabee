import test from 'node:test';
import assert from 'node:assert/strict';
import { assertGabeeUrl, isGabeeUrl, trackedUrl, DEFAULT_TIKTOK_BIO_LINK } from './links';

const DRAFT = '3f9a1c2e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

test('trackedUrl builds utm params and tiktok uses bio link', () => {
  assert.equal(
    trackedUrl({ platform: 'linkedin', target: 'landing', weekSlug: '2026-10-26', draftId: DRAFT, lang: 'en' }),
    `https://gabee.app/en?utm_source=linkedin&utm_medium=social&utm_campaign=2026-10-26&utm_content=${DRAFT}`,
  );
  // NEXT_PUBLIC_PARENT_APP_URL is unset in unit tests: parentSignupHref() is
  // relative, so the canonical production signup page is used.
  assert.equal(
    trackedUrl({ platform: 'linkedin', target: 'signup', weekSlug: '2026-10-26', draftId: DRAFT, lang: 'fr' }),
    `https://parents.gabee.app/signup?utm_source=linkedin&utm_medium=social&utm_campaign=2026-10-26&utm_content=${DRAFT}`,
  );

  // TikTok captions are not clickable: always the profile's bio link.
  const bio = 'https://gabee.app/fr?utm_source=tiktok&utm_medium=social&utm_content=bio';
  assert.equal(trackedUrl({ platform: 'tiktok', target: 'signup', weekSlug: 'w', draftId: DRAFT, lang: 'en', bioLink: bio }), bio);
  assert.equal(trackedUrl({ platform: 'tiktok', target: 'landing', weekSlug: 'w', draftId: DRAFT, lang: 'en' }), DEFAULT_TIKTOK_BIO_LINK);
  assert.equal(DEFAULT_TIKTOK_BIO_LINK, bio);
  // A tampered bio link is refused, never handed out.
  assert.throws(() =>
    trackedUrl({ platform: 'tiktok', target: 'landing', weekSlug: 'w', draftId: DRAFT, lang: 'fr', bioLink: 'https://evil.example/x' }),
  );
});

test('trackedUrl encodes the campaign and content values', () => {
  const url = new URL(trackedUrl({ platform: 'linkedin', target: 'landing', weekSlug: 'semaine 44&x=1', draftId: 'a/b', lang: 'fr' }));
  assert.equal(url.searchParams.get('utm_campaign'), 'semaine 44&x=1');
  assert.equal(url.searchParams.get('utm_content'), 'a/b');
  assert.equal(url.searchParams.get('x'), null);
});

test('assertGabeeUrl rejects evil.example', () => {
  assert.throws(() => assertGabeeUrl('https://evil.example/'), /evil\.example/);
  for (const bad of [
    'http://gabee.app/fr', // not https
    'https://gabee.app.evil.example/',
    'https://evilgabee.app/',
    'https://evil.example/?u=https://gabee.app',
    'https://user:pw@gabee.app/',
    'https://staging.gabee.app/',
    'javascript:alert(1)',
    'not a url',
  ]) {
    assert.throws(() => assertGabeeUrl(bad), `${bad} must be rejected`);
    assert.equal(isGabeeUrl(bad), false);
  }
  for (const ok of [
    'https://gabee.app/fr',
    'https://www.gabee.app/en',
    'https://parents.gabee.app/signup?utm_source=linkedin',
    'https://kids.gabee.app/?install=1',
    'https://GABEE.app/fr',
  ]) {
    assert.doesNotThrow(() => assertGabeeUrl(ok));
    assert.equal(isGabeeUrl(ok), true);
  }
});
