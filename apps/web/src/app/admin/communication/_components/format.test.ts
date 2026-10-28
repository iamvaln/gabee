import test from 'node:test';
import assert from 'node:assert/strict';
import { WEEKDAYS, mixLine, rhythmSummary } from './format';

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

test('rhythmSummary words the counts the server returns, in French and English', () => {
  assert.equal(rhythmSummary({ adjusted: 2, skipped: 1 }, 'fr'), '2 jours ajustés, 1 jour sauté');
  assert.equal(rhythmSummary({ adjusted: 1, skipped: 0 }, 'fr'), '1 jour ajusté');
  assert.equal(rhythmSummary({ adjusted: 0, skipped: 4 }, 'fr'), '4 jours sautés');
  assert.equal(rhythmSummary({ adjusted: 0, skipped: 0 }, 'fr'), 'Rien à ajuster : la semaine suit déjà ce rythme.');
  assert.equal(rhythmSummary({ adjusted: 2, skipped: 1 }, 'en'), '2 days adjusted, 1 day skipped');
  assert.equal(rhythmSummary({ adjusted: 0, skipped: 0 }, 'en'), 'Nothing to adjust: the week already follows this rhythm.');
});
