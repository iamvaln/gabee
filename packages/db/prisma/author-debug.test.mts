import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate, solveBoard, type World, type Op } from './author-debug.mjs';

function depth(ops: Op[]): number {
  let best = 0;
  for (const o of ops) {
    if (o.op === 'repeat') best = Math.max(best, 1 + depth(o.body ?? []));
    if (o.op === 'if') best = Math.max(best, 1 + depth(o.then ?? []), 1 + depth(o.else ?? []));
  }
  return best;
}
// The fix must be a SINGLE loop-count or if-cond change: given and answer are
// structurally identical except one repeat.n or one if.cond differs.
function diffKind(a: Op[], g: Op[]): 'count' | 'cond' | 'other' {
  if (a.length !== g.length) return 'other';
  let kind: 'count' | 'cond' | 'other' | null = null;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = g[i]!;
    if (x.op !== y.op) return 'other';
    if (x.op === 'repeat') {
      if ((x.n ?? 0) !== (y.n ?? 0)) { if (kind) return 'other'; kind = 'count'; }
      if (diffKind(x.body ?? [], y.body ?? []) !== 'count' && JSON.stringify(x.body) !== JSON.stringify(y.body)) return 'other';
    } else if (x.op === 'if') {
      if (x.cond !== y.cond) { if (kind) return 'other'; kind = 'cond'; }
      if (JSON.stringify(x.then) !== JSON.stringify(y.then) || JSON.stringify(x.else) !== JSON.stringify(y.else)) return 'other';
    } else if (JSON.stringify(x) !== JSON.stringify(y)) return 'other';
  }
  return kind ?? 'other';
}

const WORLDS: World[] = ['maze', 'actions'];

describe('generated debug (L6) puzzles', () => {
  for (const world of WORLDS) {
    it(`${world}: >=20, answer solves, given_program FAILS, fix is one count/cond change`, () => {
      const qs = generate(world);
      assert.ok(qs.length >= 20, `${world}: only ${qs.length}`);
      const ids = new Set<string>();
      for (const q of qs) {
        ids.add(q.id as string);
        const cfg = q.config as { given_program: Op[] };
        const ans = q.answer as Op[];
        const given = cfg.given_program;
        assert.ok(Array.isArray(given) && given.length > 0, `${q.id} missing given_program`);
        assert.ok(solveBoard(world, cfg as never, ans), `${q.id} answer does not solve`);
        assert.ok(!solveBoard(world, cfg as never, given), `${q.id} given_program should FAIL (nothing to debug)`);
        const kind = diffKind(ans, given);
        assert.notEqual(kind, 'other', `${q.id} fix is not a single count/cond change (${kind})`);
        assert.ok(depth(ans) <= 1, `${q.id} nests deeper than 1`);
      }
      assert.equal(ids.size, qs.length, `${world} duplicate ids`);
    });
  }
});
