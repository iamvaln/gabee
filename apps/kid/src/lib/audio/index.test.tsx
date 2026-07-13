// apps/kid/src/lib/audio/index.test.tsx
// Regression coverage for the provider-lifecycle contracts documented in
// index.ts: a new speak() must abandon a pending speakSuccess chain (Fix 1),
// and setEnabled(false) must silence in-flight narration (Fix 2).
import '../../test/setup-dom'; // jsdom + localStorage so the store import inside prefs works.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface FakeUtterance {
  text: string;
  voice: unknown;
  lang: string;
  rate: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function installFakeSynth(): { spoken: string[]; cancelCalls: number } {
  const state = { spoken: [] as string[], cancelCalls: 0 };
  const fakeSynth = {
    getVoices: () => [{ lang: 'fr-FR', default: true, name: 'fr', localService: true, voiceURI: 'fr' }],
    speak: (u: FakeUtterance) => {
      state.spoken.push(u.text);
      // Resolve like a real utterance, on the next tick, without blocking.
      setTimeout(() => u.onend?.(), 0);
    },
    cancel: () => {
      state.cancelCalls++;
    },
  };
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = Object.assign((g.window as object) ?? {}, { speechSynthesis: fakeSynth });
  (window as unknown as Record<string, unknown>).speechSynthesis = fakeSynth;
  g.SpeechSynthesisUtterance = class {
    text: string;
    voice: unknown = null;
    lang = '';
    rate = 0;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(t: string) {
      this.text = t;
    }
  };
  return state;
}

describe('audio index — provider lifecycle regressions', () => {
  it('a new speak() abandons a pending speakSuccess chain', async () => {
    const state = installFakeSynth();
    const { speak, speakSuccess } = await import('./index');

    speakSuccess('mot', 'fr', 'Bravo !', 'fr');
    speak('nouveau', 'fr');

    await new Promise((r) => setTimeout(r, 600));

    assert.ok(state.spoken.includes('nouveau'), 'the new prompt must be spoken');
    assert.ok(!state.spoken.includes('mot'), 'the abandoned chain word must not fire');
    assert.ok(!state.spoken.includes('Bravo !'), 'the abandoned chain praise must not fire');
  });

  it('setEnabled(false) silences in-flight narration', async () => {
    const state = installFakeSynth();
    const { speak, setEnabled } = await import('./index');

    setEnabled(true);
    speak('un', 'fr');
    assert.ok(state.spoken.includes('un'));

    const cancelsBefore = state.cancelCalls;
    setEnabled(false);
    assert.ok(state.cancelCalls > cancelsBefore, 'disabling must cancel in-flight narration');

    setEnabled(true); // restore default-enabled for any other test in this process
  });
});
