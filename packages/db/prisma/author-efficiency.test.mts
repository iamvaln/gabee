import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate, solveBoard, blockCount, flatLen, type World, type Op } from './author-efficiency.mjs';

function depth(ops: Op[]): number {
  let best = 0;
  for (const o of ops) if (o.op === 'repeat') best = Math.max(best, 1 + depth(o.body ?? []));
  return best;
}

const WORLDS: World[] = ['maze', 'actions'];

describe('generated efficiency (L7) puzzles', () => {
  for (const world of WORLDS) {
    it(`${world}: >=20, answer solves, soft optimal (no hard budget), efficiency to gain`, () => {
      const qs = generate(world);
      assert.ok(qs.length >= 20, `${world}: only ${qs.length}`);
      const ids = new Set<string>();
      for (const q of qs) {
        ids.add(q.id as string);
        const cfg = q.config as { optimalBlocks: number; maxBlocks?: number };
        const ans = q.answer as Op[];
        assert.ok(solveBoard(world, cfg as never, ans), `${q.id} answer does not solve`);
        assert.equal(cfg.optimalBlocks, blockCount(ans), `${q.id} optimalBlocks != reference blockCount`);
        assert.equal(cfg.maxBlocks, undefined, `${q.id} must NOT have a hard budget (efficiency is soft)`);
        assert.ok(flatLen(ans) > cfg.optimalBlocks, `${q.id} no efficiency to gain (flat == optimal)`);
        assert.ok(depth(ans) <= 1, `${q.id} nests deeper than 1`);
      }
      assert.equal(ids.size, qs.length, `${world} duplicate ids`);
    });
  }
});
