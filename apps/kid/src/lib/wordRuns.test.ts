import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wordRuns } from './wordRuns';

describe('wordRuns', () => {
  it('splits a sentence into words and single spaces, keeping each char index', () => {
    assert.deepEqual(wordRuns('Le chat.'), [
      { start: 0, text: 'Le', space: false },
      { start: 2, text: ' ', space: true },
      { start: 3, text: 'chat.', space: false },
    ]);
  });
  it('keeps a lone word or letter as one run', () => {
    assert.deepEqual(wordRuns('a'), [{ start: 0, text: 'a', space: false }]);
  });
  it('turns consecutive spaces into one run each (every space stays typable)', () => {
    assert.deepEqual(wordRuns('a  b').map((r) => r.text), ['a', ' ', ' ', 'b']);
  });
});
