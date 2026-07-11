import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePuzzle, flattenProgram, type Op } from './turtle';

describe('flattenProgram', () => {
  it('returns a flat move answer unchanged', () => {
    const puzzle = parsePuzzle('maze', {
      grid: { w: 5, h: 5 }, start: [0, 4], goal: [2, 3], walls: [],
    });
    const answer: Op[] = [
      { op: 'move', dir: 'right' },
      { op: 'move', dir: 'right' },
      { op: 'move', dir: 'up' },
    ];
    assert.deepEqual(flattenProgram(puzzle, answer), answer);
  });

  it('expands a repeat into repeated prims', () => {
    const puzzle = parsePuzzle('maze', { grid: { w: 5, h: 5 }, start: [0, 0], goal: [3, 0], walls: [] });
    const answer: Op[] = [{ op: 'repeat', n: 3, body: [{ op: 'move', dir: 'right' }] }];
    assert.deepEqual(flattenProgram(puzzle, answer), [
      { op: 'move', dir: 'right' },
      { op: 'move', dir: 'right' },
      { op: 'move', dir: 'right' },
    ]);
  });

  it('skips a blocked (no-op) move so the flat program matches what succeeds', () => {
    // From (0,0) an `up` leaves the grid (blocked) — runProgram would score it
    // as wasted, so it must not appear in the flattened program the kid builds.
    const puzzle = parsePuzzle('maze', { grid: { w: 3, h: 3 }, start: [0, 0], goal: [1, 0], walls: [] });
    const answer: Op[] = [{ op: 'move', dir: 'up' }, { op: 'move', dir: 'right' }];
    assert.deepEqual(flattenProgram(puzzle, answer), [{ op: 'move', dir: 'right' }]);
  });

  it('keeps pick/drop prims for the actions world', () => {
    const puzzle = parsePuzzle('actions', {
      grid: { w: 3, h: 1 }, start: [0, 0], items: [[1, 0]], targets: [[2, 0]], walls: [],
    });
    const answer: Op[] = [
      { op: 'move', dir: 'right' }, { op: 'pick' },
      { op: 'move', dir: 'right' }, { op: 'drop' },
    ];
    assert.deepEqual(flattenProgram(puzzle, answer), answer);
  });
});
