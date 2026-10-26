import test from 'node:test';
import assert from 'node:assert/strict';
import { WEEKDAYS, mixLine } from './format';

test('mixLine says the week mix in words, with French plurals', () => {
  assert.equal(mixLine({ gabee: 2, light: 1, value: 3 }, 'fr'), '2 sur Gabee · 1 léger · 3 conseils');
  assert.equal(mixLine({ gabee: 0, light: 2, value: 1 }, 'fr'), '0 sur Gabee · 2 légers · 1 conseil');
  assert.equal(mixLine({ gabee: 2, light: 1, value: 3 }, 'en'), '2 about Gabee · 1 light · 3 advice');
});

test('WEEKDAYS lists the seven days once, Monday first', () => {
  assert.deepEqual(
    WEEKDAYS.map((d) => d.day),
    [1, 2, 3, 4, 5, 6, 0],
  );
});
