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

describe('parsePuzzle maxBlocks', () => {
  it('reads config.maxBlocks when present', () => {
    const p = parsePuzzle('maze', { grid: { w: 5, h: 5 }, start: [0, 0], goal: [1, 0], maxBlocks: 3 });
    assert.equal(p.maxBlocks, 3);
  });
  it('leaves maxBlocks undefined when absent', () => {
    const p = parsePuzzle('maze', { grid: { w: 5, h: 5 }, start: [0, 0], goal: [1, 0] });
    assert.equal(p.maxBlocks, undefined);
  });
});

import { boardsFor, runBoards } from './turtle';

describe('boardsFor', () => {
  it('returns a single board when config.boards is absent', () => {
    const bs = boardsFor('maze', { grid: { w: 3, h: 1 }, start: [0, 0], goal: [2, 0], walls: [] });
    assert.equal(bs.length, 1);
    assert.deepEqual(bs[0]!.goal, { x: 2, y: 0 });
  });
  it('returns one puzzle per board, each merged over shared config', () => {
    const bs = boardsFor('maze', {
      grid: { w: 3, h: 1 }, blocks: ['right', 'if'],
      boards: [{ start: [0, 0], goal: [2, 0], walls: [[1, 0]] }, { start: [0, 0], goal: [2, 0], walls: [] }],
    });
    assert.equal(bs.length, 2);
    assert.equal(bs[0]!.walls!.length, 1);
    assert.equal(bs[1]!.walls!.length, 0);
    assert.equal(bs[0]!.w, 3);
  });
});

describe('runBoards', () => {
  it('succeeds only when the program solves every board', () => {
    const bs = boardsFor('maze', {
      grid: { w: 3, h: 2 }, boards: [
        { start: [0, 0], goal: [2, 0], walls: [[1, 0]] }, // straight blocked -> detour down
        { start: [0, 0], goal: [2, 0], walls: [[0, 1]] }, // detour blocked -> straight
      ],
    });
    const prog: Op[] = [{ op: 'if', cond: 'wall_right',
      then: [{ op: 'move', dir: 'down' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'up' }],
      else: [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }] }];
    assert.equal(runBoards(bs, prog).success, true);
    const elseOnly: Op[] = [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }];
    assert.equal(runBoards(bs, elseOnly).success, false);
  });
});
