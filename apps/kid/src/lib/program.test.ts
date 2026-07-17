import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  empty, addPrim, addLoop, setActive, setCount, removeTop, removeInside, blockCount,
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

  it('removeInside drops one loop body primitive', () => {
    let s = addPrim(addPrim(addLoop(empty()), 'right'), 'up');
    s = removeInside(s, 0, 'body', 0);
    assert.deepEqual((s.program[0] as { body: unknown[] }).body, [{ op: 'move', dir: 'up' }]);
  });

  it('blockCount counts each primitive and each loop container as 1', () => {
    // top: up + loop(container + 2 body) => 1 + (1 + 2) = 4
    let s = addPrim(empty(), 'up');
    s = addPrim(addPrim(addLoop(s), 'right'), 'down');
    assert.equal(blockCount(s.program), 4);
  });
});

import { addIf, setCond, setSlot } from './program';

describe('program model — if', () => {
  it('addIf appends if{cond:wall_right,then:[],else:[]} active on then', () => {
    const s = addIf(empty());
    assert.deepEqual(s.program, [{ op: 'if', cond: 'wall_right', then: [], else: [] }]);
    assert.equal(s.active, 0);
    assert.equal(s.slot, 'then');
  });
  it('adds primitives into the active then/else slot', () => {
    let s = addIf(empty());
    s = addPrim(s, 'down');
    s = setSlot(s, 'else');
    s = addPrim(s, 'right');
    assert.deepEqual(s.program[0], { op: 'if', cond: 'wall_right', then: [{ op: 'move', dir: 'down' }], else: [{ op: 'move', dir: 'right' }] });
  });
  it('setCond changes the sensed direction', () => {
    let s = addIf(empty());
    s = setCond(s, 0, 'wall_up');
    assert.equal((s.program[0] as { cond: string }).cond, 'wall_up');
  });
  it('removeInside drops one branch primitive', () => {
    let s = addPrim(addPrim(addIf(empty()), 'down'), 'left'); // then: [down,left]
    s = removeInside(s, 0, 'then', 0);
    assert.deepEqual((s.program[0] as { then: unknown[] }).then, [{ op: 'move', dir: 'left' }]);
  });
  it('blockCount counts the if container + both branches', () => {
    let s = addIf(empty());
    s = addPrim(s, 'down');
    s = addPrim(setSlot(s, 'else'), 'right');
    assert.equal(blockCount(s.program), 3);
  });
  it('loops still work (slot defaults to body)', () => {
    const s = addPrim(addLoop(empty()), 'right');
    assert.deepEqual(s.program[0], { op: 'repeat', n: 2, body: [{ op: 'move', dir: 'right' }] });
    assert.equal(s.slot, 'body');
  });
});
