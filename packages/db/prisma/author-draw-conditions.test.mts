import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate, solves, isForcing, type Op } from './author-draw-conditions.mjs';

describe('generated draw pen-condition (L4) puzzles', () => {
  it('produces puzzles that solve all boards, genuinely fork, and need the pen', () => {
    const qs = generate();
    assert.ok(qs.length >= 8, `only ${qs.length}`);
    const ids = new Set<string>();
    for (const q of qs) {
      ids.add(q.id as string);
      const cfg = q.config as { blocks: string[]; boards: unknown[] };
      const ans = q.answer as Op[];
      const blocks = cfg.blocks;
      assert.ok(blocks.includes('if'), `${q.id} missing if block`);
      assert.ok(blocks.includes('pen_up') && blocks.includes('pen_down'), `${q.id} missing pen blocks`);
      assert.equal(cfg.boards.length, 2, `${q.id} should have 2 boards`);
      // The reference program solves every board.
      assert.ok(solves(cfg, ans), `${q.id} answer does not solve all boards`);
      // Forcing: a branch-free program (then-only OR else-only) fails a board.
      assert.ok(isForcing(cfg, ans), `${q.id} is not forcing (branch not required)`);
      // The forcing branch is a pen lift — the answer must actually raise the pen.
      const iff = ans.find((o) => o.op === 'if')!;
      assert.ok((iff.then ?? []).some((o) => o.op === 'pen' && o.state === 'up'), `${q.id} then-branch never lifts the pen`);
    }
    assert.equal(ids.size, qs.length, 'duplicate ids');
  });
});
