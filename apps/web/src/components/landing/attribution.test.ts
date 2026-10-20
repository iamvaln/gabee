import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withAttribution, utmFromSearch } from './attribution';

test('withAttribution forwards utm params and preserves existing query', () => {
  const out = withAttribution(
    'https://parents.gabee.app/signup?invite=abc',
    { search: '?utm_source=linkedin&utm_medium=social&utm_content=d1&other=1' },
    '',
  );
  const u = new URL(out);
  assert.equal(u.searchParams.get('invite'), 'abc');
  assert.equal(u.searchParams.get('utm_source'), 'linkedin');
  assert.equal(u.searchParams.get('utm_medium'), 'social');
  assert.equal(u.searchParams.get('utm_content'), 'd1');
  assert.equal(u.searchParams.get('other'), null);
});

test('withAttribution adds ref=<host> for an external referrer without utm', () => {
  const out = withAttribution('/parent/signup', { search: '' }, 'https://www.linkedin.com/feed/');
  assert.equal(out, '/parent/signup?ref=www.linkedin.com');
});

test('withAttribution leaves the href alone with no utm and no referrer', () => {
  assert.equal(withAttribution('/parent/signup', { search: '' }, ''), '/parent/signup');
  assert.equal(withAttribution('#how', { search: '?utm_source=x' }, ''), '#how');
});

test('withAttribution does not override an explicit utm already on the href', () => {
  const out = withAttribution('/s?utm_source=keep', { search: '?utm_source=other' }, '');
  assert.equal(out, '/s?utm_source=keep');
});

test('utmFromSearch reads utm_* into the Utm shape', () => {
  assert.deepEqual(utmFromSearch('?utm_source=a&utm_content=b&x=1'), { source: 'a', content: 'b' });
});
