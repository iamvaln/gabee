import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keyboard L5 = whole sentences kids type (copy) or type before they scroll off
// (speed). They used to be random noun+verb pairs ("La table pleure.", "Le vélo
// rit.") — these guard the shape of the hand-written replacements. Meaning itself
// can't be asserted; the blocklist below pins the old generator's vocabulary.
type Bi = { fr: string; en: string };
type Q = { id: string; sub_mode: string; level: number; answer: Bi; config: { target: Bi } };
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-data', 'keyboard.json');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const qs: Q[] = (Array.isArray(raw) ? raw : raw.questions).filter((q: Q) => q.level === 5);
const MODES = { copy: 30, speed: 22 } as const; // max length per mode (speed scrolls off)

test('L5 keeps 60 sentences per mode', () => {
  for (const mode of Object.keys(MODES)) {
    assert.equal(qs.filter((q) => q.sub_mode === mode).length, 60, `${mode}: count`);
  }
});

test('L5 target mirrors the answer, in both languages', () => {
  for (const q of qs) assert.deepEqual(q.config.target, q.answer, `${q.id}: target != answer`);
});

test('L5 sentences are well-formed and typable', () => {
  // The kid app matches each keystroke exactly (case-insensitive only), so no
  // dead-key characters (circumflex, cedilla, ligatures) and no apostrophes.
  const untypable = /[çâêîôûëïüœæ'’]/i;
  for (const q of qs) {
    for (const lang of ['fr', 'en'] as const) {
      const s = q.answer[lang];
      assert.match(s, /^[A-Z][^]*\.$/, `${q.id}/${lang}: capital + full stop: "${s}"`);
      assert.ok(!untypable.test(s), `${q.id}/${lang}: hard-to-type character: "${s}"`);
      assert.ok(s.length <= MODES[q.sub_mode as keyof typeof MODES], `${q.id}/${lang}: too long: "${s}"`);
      assert.ok(!/\s{2}/.test(s), `${q.id}/${lang}: double space`);
    }
  }
});

test('L5 sentences are unique within a mode', () => {
  for (const mode of Object.keys(MODES)) {
    const fr = qs.filter((q) => q.sub_mode === mode).map((q) => q.answer.fr);
    assert.equal(new Set(fr).size, fr.length, `${mode}: duplicate sentences`);
  }
});

test('L5 carries none of the old nonsense pairs', () => {
  const nonsense = ['La table pleure.', 'Le camion marche.', 'La lune mange.', 'Le vélo rit.', 'La maison chante.', 'Le livre vole.'];
  const hits = qs.filter((q) => nonsense.includes(q.answer.fr)).map((q) => q.answer.fr);
  assert.deepEqual(hits, []);
});
