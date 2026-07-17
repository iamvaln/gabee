import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate, solves, isForcing, loopForcing, blockCount, type World, type Op } from './author-combo.mjs';

function depth(ops: Op[]): number {
  let best = 0;
  for (const o of ops) {
    if (o.op === 'repeat') best = Math.max(best, 1 + depth(o.body ?? []));
    if (o.op === 'if') best = Math.max(best, 1 + depth(o.then ?? []), 1 + depth(o.else ?? []));
  }
  return best;
}
function hasLoop(ops: Op[]): boolean { return ops.some((o) => o.op === 'repeat'); }
function hasIf(ops: Op[]): boolean { return ops.some((o) => o.op === 'if'); }

const WORLDS: World[] = ['maze', 'actions'];

describe('generated combine (L5) puzzles', () => {
  for (const world of WORLDS) {
    it(`${world}: >=20 puzzles, each solvable / if-forcing / loop-forcing / editor-constructible`, () => {
      const qs = generate(world);
      assert.ok(qs.length >= 20, `${world}: only ${qs.length}`);
      const ids = new Set<string>();
      for (const q of qs) {
        ids.add(q.id as string);
        const cfg = q.config as never;
        const ans = q.answer as Op[];
        const maxBlocks = (q.config as { maxBlocks: number }).maxBlocks;
        const boards = (q.config as { boards: unknown[] }).boards;
        assert.ok(Array.isArray(boards) && boards.length >= 2, `${q.id} needs >=2 boards`);
        assert.ok(hasLoop(ans) && hasIf(ans), `${q.id} must use BOTH a loop and an if`);
        assert.ok(solves(world, cfg, ans), `${q.id} does not solve all boards`);
        assert.ok(isForcing(world, cfg, ans), `${q.id} branch not required`);
        assert.ok(loopForcing(ans, maxBlocks), `${q.id} loop not required (flat fits budget)`);
        assert.equal(maxBlocks, blockCount(ans), `${q.id} maxBlocks != reference blockCount`);
        assert.ok(depth(ans) <= 1, `${q.id} nests deeper than 1`);
      }
      assert.equal(ids.size, qs.length, `${world} has duplicate ids`);
    });
  }
});
