import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate, solves, isForcing, loopForcing, blockCount, type Op } from './author-draw-combo.mjs';

describe('generated draw combine (L5) puzzles', () => {
  it('each solves all boards and requires BOTH a loop and a pen-condition', () => {
    const qs = generate();
    assert.ok(qs.length >= 8, `only ${qs.length}`);
    const ids = new Set<string>();
    for (const q of qs) {
      ids.add(q.id as string);
      const cfg = q.config as { blocks: string[]; boards: unknown[]; maxBlocks: number };
      const ans = q.answer as Op[];
      assert.ok(cfg.blocks.includes('repeat') && cfg.blocks.includes('if'), `${q.id} missing repeat/if`);
      assert.ok(cfg.blocks.includes('pen_up') && cfg.blocks.includes('pen_down'), `${q.id} missing pen blocks`);
      assert.equal(cfg.boards.length, 2, `${q.id} should have 2 boards`);
      // The reference program uses a loop AND an if.
      assert.ok(ans.some((o) => o.op === 'repeat'), `${q.id} answer has no loop`);
      assert.ok(ans.some((o) => o.op === 'if'), `${q.id} answer has no if`);
      // Solves both boards.
      assert.ok(solves(cfg, ans), `${q.id} answer does not solve all boards`);
      // Loop required: inlining it exceeds the block budget.
      assert.ok(loopForcing(ans, cfg.maxBlocks), `${q.id} loop not forced by budget`);
      assert.equal(blockCount(ans), cfg.maxBlocks, `${q.id} maxBlocks != blockCount`);
      // Pen-condition required: a branch-free program fails a board.
      assert.ok(isForcing(cfg, ans), `${q.id} pen-condition not forced`);
      // The forcing branch actually lifts the pen.
      const iff = ans.find((o) => o.op === 'if')!;
      assert.ok((iff.then ?? []).some((o) => o.op === 'pen' && o.state === 'up'), `${q.id} then-branch never lifts the pen`);
    }
    assert.equal(ids.size, qs.length, 'duplicate ids');
  });
});
