import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate, solveDraw, needsPen, type Op } from './author-draw-pen.mjs';

describe('generated draw pen-sequence (L2) puzzles', () => {
  it('produces >=20 puzzles, each solvable and genuinely needing the pen', () => {
    const qs = generate();
    assert.ok(qs.length >= 20, `only ${qs.length}`);
    const ids = new Set<string>();
    for (const q of qs) {
      ids.add(q.id as string);
      const cfg = q.config as never;
      const ans = q.answer as Op[];
      assert.ok((q.config as { blocks: string[] }).blocks.includes('pen_up'), `${q.id} missing pen blocks`);
      assert.ok(solveDraw(cfg, ans), `${q.id} answer does not draw the target`);
      // Needs the pen: keeping the pen down the whole time draws extra segments → fails.
      assert.ok(needsPen(cfg, ans), `${q.id} solvable without lifting the pen`);
    }
    assert.equal(ids.size, qs.length, 'duplicate ids');
  });
});
