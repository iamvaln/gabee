import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate, solves, isForcing, type World } from './author-conditions.mjs';

const WORLDS: World[] = ['maze', 'actions'];

describe('generated conditions puzzles', () => {
  for (const world of WORLDS) {
    it(`${world}: >=20 puzzles, each solvable on all boards + forcing`, () => {
      const qs = generate(world);
      assert.ok(qs.length >= 20, `${world}: only ${qs.length}`);
      const ids = new Set<string>();
      for (const q of qs) {
        ids.add(q.id as string);
        const cfg = q.config as never;
        const ans = q.answer as never[];
        const boards = (q.config as { boards: unknown[] }).boards;
        assert.ok(Array.isArray(boards) && boards.length >= 2, `${q.id} needs >=2 boards`);
        assert.ok(solves(world, cfg, ans), `${q.id} does not solve all boards`);
        assert.ok(isForcing(world, cfg, ans), `${q.id} branch is not required`);
      }
      assert.equal(ids.size, qs.length, `${world} has duplicate ids`);
    });
  }
});
