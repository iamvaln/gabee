import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-data', 'translation.json');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const qs: any[] = Array.isArray(raw) ? raw : raw.questions;

test('every question is MCQ, direction-consistent', () => {
  for (const q of qs) {
    assert.equal(q.type, 'translation', `${q.id}: type`);
    assert.ok(Array.isArray(q.distractors) && q.distractors.length >= 1, `${q.id}: distractors`);
    assert.equal(q.config?.direction, q.sub_mode, `${q.id}: sub_mode != direction`);
  }
});

test('L1 is text-only — no images anywhere in translation', () => {
  const withImage = qs.filter((q) => q.config?.image);
  assert.deepEqual(withImage.map((q) => q.id), [], 'these still carry config.image');
});

test('L1 items carry a text source (config.source)', () => {
  const l1 = qs.filter((q) => q.level === 1);
  const missing = l1.filter((q) => !q.config?.source);
  assert.deepEqual(missing.map((q) => q.id), [], 'L1 items missing config.source');
});

test('L1 source and answer are different languages (not identical)', () => {
  const l1 = qs.filter((q) => q.level === 1);
  const degenerate = l1.filter(
    (q) => String(q.config?.source).toLowerCase() === String(q.answer).toLowerCase(),
  );
  assert.deepEqual(degenerate.map((q) => q.id), [], 'L1 items where source == answer');
});

test('directions are mirrored per level', () => {
  const count = (d: string, l: number) => qs.filter((q) => q.sub_mode === d && q.level === l).length;
  for (let l = 1; l <= 5; l++) {
    assert.equal(count('fr-en', l), count('en-fr', l), `level ${l} not mirrored`);
  }
});
