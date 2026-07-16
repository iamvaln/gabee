import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blockCount, flatLen, loopBudget } from './loop-budgets.mts';

describe('blockCount (container + body)', () => {
  it('counts each primitive and each loop container as 1', () => {
    assert.equal(blockCount([{ op: 'move', dir: 'up' }]), 1);
    assert.equal(blockCount([{ op: 'repeat', n: 3, body: [{ op: 'move', dir: 'right' }] }]), 2);
    assert.equal(blockCount([{ op: 'move', dir: 'up' }, { op: 'repeat', n: 2, body: [{ op: 'move', dir: 'r' }, { op: 'move', dir: 'r' }] }]), 4);
  });
});

describe('flatLen (expanded primitive count)', () => {
  it('expands repeats by n', () => {
    assert.equal(flatLen([{ op: 'repeat', n: 3, body: [{ op: 'move', dir: 'right' }] }]), 3);
    assert.equal(flatLen([{ op: 'move', dir: 'up' }, { op: 'repeat', n: 2, body: [{ op: 'move', dir: 'r' }] }]), 3);
    assert.equal(flatLen([{ op: 'repeat', n: 2, body: [{ op: 'move', dir: 'a' }, { op: 'move', dir: 'b' }] }]), 4);
  });
});

describe('loopBudget', () => {
  it('returns the reference block count when a loop actually compresses', () => {
    assert.equal(loopBudget([{ op: 'repeat', n: 3, body: [{ op: 'move', dir: 'right' }] }]), 2); // flat 3 > 2
    assert.equal(loopBudget([{ op: 'move', dir: 'u' }, { op: 'repeat', n: 3, body: [{ op: 'move', dir: 'r' }] }]), 3); // flat 4 > 3
  });
  it('returns null for degenerate loops that do not compress', () => {
    assert.equal(loopBudget([{ op: 'repeat', n: 2, body: [{ op: 'move', dir: 'right' }] }]), null); // flat 2 == blocks 2
  });
  it('returns null when there is no loop at all', () => {
    assert.equal(loopBudget([{ op: 'move', dir: 'a' }, { op: 'move', dir: 'b' }]), null);
  });
});
