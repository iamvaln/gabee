import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  empty, addPrim, addLoop, setActive, setCount, removeTop, removeInLoop, blockCount,
} from './program';

describe('program model', () => {
  it('adds primitives at top level when no loop is active', () => {
    let s = empty();
    s = addPrim(s, 'up');
    s = addPrim(s, 'right');
    assert.deepEqual(s.program, [{ op: 'move', dir: 'up' }, { op: 'move', dir: 'right' }]);
    assert.equal(s.active, null);
  });

  it('addLoop appends repeat{n:2,body:[]} and makes it active', () => {
    let s = empty();
    s = addLoop(s);
    assert.deepEqual(s.program, [{ op: 'repeat', n: 2, body: [] }]);
    assert.equal(s.active, 0);
  });

  it('adds primitives into the active loop body', () => {
    let s = addLoop(empty());
    s = addPrim(s, 'right');
    s = addPrim(s, 'up');
    assert.deepEqual(s.program, [{ op: 'repeat', n: 2, body: [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'up' }] }]);
  });

  it('setActive(null) returns adds to the top level again', () => {
    let s = addPrim(addLoop(empty()), 'right'); // loop active, body has one
    s = setActive(s, null);
    s = addPrim(s, 'down');
    assert.equal(s.program.length, 2);
    assert.deepEqual(s.program[1], { op: 'move', dir: 'down' });
  });

  it('setCount clamps to 2..5', () => {
    const s = addLoop(empty());
    assert.equal((setCount(s, 0, 9).program[0] as { n: number }).n, 5);
    assert.equal((setCount(s, 0, 1).program[0] as { n: number }).n, 2);
    assert.equal((setCount(s, 0, 4).program[0] as { n: number }).n, 4);
  });

  it('removeTop drops the item and clears active when the active loop is removed', () => {
    let s = addPrim(addLoop(empty()), 'right'); // active loop 0 with body
    s = removeTop(s, 0);
    assert.deepEqual(s.program, []);
    assert.equal(s.active, null);
  });

  it('removeInLoop drops one body primitive', () => {
    let s = addPrim(addPrim(addLoop(empty()), 'right'), 'up');
    s = removeInLoop(s, 0, 0);
    assert.deepEqual((s.program[0] as { body: unknown[] }).body, [{ op: 'move', dir: 'up' }]);
  });

  it('blockCount counts each primitive and each loop container as 1', () => {
    // top: up + loop(container + 2 body) => 1 + (1 + 2) = 4
    let s = addPrim(empty(), 'up');
    s = addPrim(addPrim(addLoop(s), 'right'), 'down');
    assert.equal(blockCount(s.program), 4);
  });
});
