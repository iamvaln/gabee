import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePuzzle, type Prim } from './turtle';
import { buildGuideScript } from './guideScripts';

describe('buildGuideScript', () => {
  it('maze: one step per arrow, then run, then success', () => {
    const puzzle = parsePuzzle('maze', { grid: { w: 5, h: 5 }, start: [0, 4], goal: [2, 4], walls: [] });
    const flat: Prim[] = [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }];
    const script = buildGuideScript('maze', puzzle, flat);
    assert.equal(script.length, 4); // 2 arrows + run + success
    assert.deepEqual(script.map((s) => s.advanceOn), ['block-placed', 'block-placed', 'run-pressed', 'success']);
    assert.deepEqual(script[0]!.allow, ['palette:right']);
    assert.deepEqual(script[2]!.allow, ['run']);
    assert.deepEqual(script[3]!.allow, []);
    assert.equal(script[0]!.target, 'palette:right');
    assert.equal(script[2]!.target, 'run');
  });

  it('actions: includes pick and drop steps', () => {
    const puzzle = parsePuzzle('actions', { grid: { w: 3, h: 1 }, start: [0, 0], items: [[1, 0]], targets: [[2, 0]], walls: [] });
    const flat: Prim[] = [{ op: 'move', dir: 'right' }, { op: 'pick' }, { op: 'move', dir: 'right' }, { op: 'drop' }];
    const script = buildGuideScript('actions', puzzle, flat);
    assert.deepEqual(script.map((s) => s.advanceOn),
      ['block-placed', 'pick-placed', 'block-placed', 'drop-placed', 'run-pressed', 'success']);
    assert.deepEqual(script[1]!.allow, ['palette:pick']);
    assert.deepEqual(script[3]!.allow, ['palette:drop']);
  });

  it('returns empty when there is no solution', () => {
    const puzzle = parsePuzzle('maze', { grid: { w: 3, h: 3 }, start: [0, 0], goal: [0, 0], walls: [] });
    assert.deepEqual(buildGuideScript('maze', puzzle, []), []);
  });
});
