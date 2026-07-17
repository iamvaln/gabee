import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classify, targetLevel } from './reclassify-code.mjs';

describe('classify', () => {
  it('sequence: only move/pick/drop', () => {
    assert.equal(classify([{ op: 'move', dir: 'up' }, { op: 'pick' }]), 'sequence');
  });
  it('loops: has repeat, no if', () => {
    assert.equal(classify([{ op: 'repeat', n: 2, body: [{ op: 'move', dir: 'up' }] }]), 'loops');
  });
  it('conditions: has if, no repeat', () => {
    assert.equal(classify([{ op: 'if', cond: 'wall_up', then: [{ op: 'move', dir: 'left' }] }]), 'conditions');
  });
  it('combo: repeat nested inside if (walks then/else/body)', () => {
    assert.equal(classify([{ op: 'if', cond: 'wall_up', then: [{ op: 'repeat', n: 2, body: [] }] }]), 'combo');
  });
});

describe('targetLevel', () => {
  it('loops -> 3, conditions -> 4, combo -> 5', () => {
    assert.equal(targetLevel('loops', 5), 3);
    assert.equal(targetLevel('conditions', 3), 4);
    assert.equal(targetLevel('combo', 3), 5);
  });
  it('sequence stays at L1/L2 when already there, else moves to L2', () => {
    assert.equal(targetLevel('sequence', 1), 1);
    assert.equal(targetLevel('sequence', 2), 2);
    assert.equal(targetLevel('sequence', 4), 2);
  });
});
