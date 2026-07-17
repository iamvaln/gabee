import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate, solves, type Op, type World } from './author-loops.mjs';
import { loopBudget } from './loop-budgets.mjs';

function depth(ops: Op[]): number {
  let best = 0;
  for (const o of ops) if (o.op === 'repeat') best = Math.max(best, 1 + depth(o.body));
  return best;
}
function hasIf(ops: Op[]): boolean {
  return ops.some((o) => o.op === ('if' as string) || (o.op === 'repeat' && hasIf(o.body)));
}

const WORLDS: World[] = ['maze', 'draw', 'actions'];

describe('generated loop puzzles', () => {
  for (const world of WORLDS) {
    it(`${world}: produces >=20 puzzles, all solvable / loop-requiring / editor-constructible`, () => {
      const qs = generate(world);
      assert.ok(qs.length >= 20, `${world} only produced ${qs.length}`);
      const ids = new Set<string>();
      for (const q of qs) {
        const answer = q.answer as Op[];
        const config = q.config as never;
        ids.add(q.id as string);
        assert.ok(solves(world, config, answer), `${q.id} does not solve`);
        assert.notEqual(loopBudget(answer), null, `${q.id} loop does not compress`);
        assert.equal((q.config as { maxBlocks: number }).maxBlocks, loopBudget(answer), `${q.id} wrong maxBlocks`);
        assert.ok(depth(answer) <= 1, `${q.id} nests deeper than 1`);
        assert.ok(!hasIf(answer), `${q.id} uses if`);
      }
      assert.equal(ids.size, qs.length, `${world} has duplicate ids`);
    });
  }
});
