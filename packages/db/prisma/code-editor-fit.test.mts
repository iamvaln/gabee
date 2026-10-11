import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODE_LOOP_MIN, CODE_LOOP_MAX } from '@gabee/types';

// Every Code puzzle must be SOLVABLE IN THE KID EDITOR (apps/kid/src/lib/program.ts),
// not just by the solver: its reference program has to be enterable with the editor's
// controls and fit the puzzle's block budget. Two content/editor mismatches made 100
// puzzles impossible: loop counts above the editor's ×5 cap, and blocks after an `if`
// (the editor had no way to leave an if branch).
type Op = { op: string; n?: number; body?: Op[]; then?: Op[]; else?: Op[] };
type Q = { id: string; answer: Op[]; config: { maxBlocks?: number } };
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-data', 'code.json');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const qs: Q[] = Array.isArray(raw) ? raw : raw.questions;

// Same rule as apps/kid/src/lib/program.ts blockCount: every op is 1, containers add their contents.
const blockCount = (ops: Op[]): number =>
  ops.reduce((n, o) => n + 1 + blockCount(o.body ?? []) + blockCount(o.then ?? []) + blockCount(o.else ?? []), 0);
const inner = (o: Op) => [...(o.body ?? []), ...(o.then ?? []), ...(o.else ?? [])];

test('loop counts are within the editor range', () => {
  const bad = qs.filter((q) => q.answer.some((o) => o.op === 'repeat' && (o.n! < CODE_LOOP_MIN || o.n! > CODE_LOOP_MAX)));
  assert.deepEqual(bad.map((q) => q.id), []);
});

test('no container inside a container (the editor only places loops/ifs at top level)', () => {
  const bad = qs.filter((q) => q.answer.some((o) => inner(o).some((i) => i.op === 'repeat' || i.op === 'if')));
  assert.deepEqual(bad.map((q) => q.id), []);
});

test('the reference program fits the block budget', () => {
  const bad = qs.filter((q) => q.config.maxBlocks !== undefined && blockCount(q.answer) > q.config.maxBlocks);
  assert.deepEqual(bad.map((q) => `${q.id} (${blockCount(q.answer)}/${q.config.maxBlocks})`), []);
});
