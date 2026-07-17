import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { solvesAllBoards } from './publish.mjs';

const prog = [{ op: 'if', cond: 'wall_right',
  then: [{ op: 'move', dir: 'down' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'up' }],
  else: [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }] }];

describe('solvesAllBoards', () => {
  it('true when the reference solves every board', () => {
    const config = { grid: { w: 3, h: 2 }, boards: [
      { start: [0, 0], goal: [2, 0], walls: [[1, 0]] }, // straight blocked -> detour
      { start: [0, 0], goal: [2, 0], walls: [[0, 1]] }, // detour blocked -> straight
    ] };
    assert.equal(solvesAllBoards('maze', config, prog), true);
  });
  it('false when a board is unsolved', () => {
    const config = { grid: { w: 3, h: 2 }, boards: [
      { start: [0, 0], goal: [2, 0], walls: [[1, 0]] },
      { start: [0, 0], goal: [9, 9], walls: [] }, // impossible goal
    ] };
    assert.equal(solvesAllBoards('maze', config, prog), false);
  });
  it('single board when boards absent', () => {
    assert.equal(solvesAllBoards('maze', { grid: { w: 3, h: 1 }, start: [0, 0], goal: [2, 0], walls: [] },
      [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }]), true);
  });
});
