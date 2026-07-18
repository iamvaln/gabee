import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleRolloutEmail } from './rollout-email';

test('single feature: FR and EN blocks both present', () => {
  const { subject, text, html } = assembleRolloutEmail(['code_l6']);
  assert.ok(subject.length > 0);
  assert.ok(text.includes('Débogage')); // FR title
  assert.ok(text.includes('Debugging')); // EN title
  assert.ok(html.includes('<')); // some markup
});

test('multiple features render in FLAG_KEYS order, ignoring unknown/non-announceable', () => {
  // Pass them out of registry order; output must follow FLAG_KEYS:
  // kid_ambient_music (idx 1) before code_draw_l4 (idx 4).
  const { text } = assembleRolloutEmail(['code_draw_l4', 'kid_ambient_music', 'kid_voiceover']);
  const drawIdx = text.indexOf('Dessiner');
  const musicIdx = text.indexOf(`musique d'ambiance`);
  assert.ok(drawIdx > -1 && musicIdx > -1);
  assert.ok(musicIdx < drawIdx, 'kid_ambient_music comes before code_draw_l4 (FLAG_KEYS order)');
  // kid_voiceover has no announcement copy → dropped (its title never appears)
  assert.ok(!text.includes('Voiceover') && !text.includes('narration'));
});
