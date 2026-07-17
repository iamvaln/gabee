// apps/kid/src/lib/audio/flag-gates.dom.test.tsx
// Admin feature-flag gates over the audio boundary (design 2026-07-16):
//  - kid_ambient_music OFF → reevaluateMusic never starts a source, even in the
//    ambient zone with both prefs on.
//  - kid_voiceover OFF → speak() no-ops (the provider's synth.speak is never
//    reached), while SFX/cues stay unaffected.
import '../../test/setup-dom';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from '../../store';

interface FakeSource {
  buffer: unknown; loop: boolean; started: boolean; stopped: boolean;
  connect: (n: unknown) => void; start: () => void; stop: () => void;
}

function installFakeAudio() {
  const state = { sources: [] as FakeSource[], oscillators: 0 };
  const fakeCtx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: () => Promise.resolve(),
    decodeAudioData: (_: ArrayBuffer) => Promise.resolve({ duration: 4 }),
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => {},
        cancelScheduledValues: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
    }),
    createOscillator: () => {
      state.oscillators++;
      return { type: 'sine', frequency: { value: 0 }, connect: () => {}, start: () => {}, stop: () => {} };
    },
    createBufferSource: () => {
      const s: FakeSource = {
        buffer: null, loop: false, started: false, stopped: false,
        connect: () => {}, start: () => { s.started = true; }, stop: () => { s.stopped = true; },
      };
      state.sources.push(s);
      return s;
    },
  };
  (window as unknown as { __gabeeAudio?: unknown }).__gabeeAudio = fakeCtx;
  (globalThis as { fetch?: unknown }).fetch = () =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  return state;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('kid_ambient_music flag gate', () => {
  let audio: typeof import('./index');
  let state: ReturnType<typeof installFakeAudio>;

  beforeEach(async () => {
    state = installFakeAudio();
    audio = await import('./index');
    audio.setEnabled(true);
    audio.setMusicEnabled(true);
    audio.setMusicZone('silent');
    await tick();
    state.sources.length = 0;
  });

  it('flag OFF → no source in ambient zone even with both prefs on', async () => {
    useStore.setState({ featureFlags: { kid_ambient_music: false } });
    audio.setMusicZone('ambient');
    await tick(); await tick();
    assert.equal(state.sources.length, 0, 'music must not start while the flag is off');
  });

  it('flag ON → ambient zone starts a looping source', async () => {
    useStore.setState({ featureFlags: { kid_ambient_music: true } });
    audio.setMusicZone('ambient');
    await tick(); await tick();
    const s = state.sources.at(-1);
    assert.ok(s?.started, 'source started once the flag is on');
    assert.equal(s?.loop, true, 'loop must be gapless');
  });
});

describe('kid_game_sounds flag gate', () => {
  let audio: typeof import('./index');
  let state: ReturnType<typeof installFakeAudio>;

  beforeEach(async () => {
    state = installFakeAudio();
    audio = await import('./index');
    audio.setEnabled(true); // master on — the flag is the only variable under test
  });

  it('flag OFF → sfx() fires no cue (no oscillator), master still on', () => {
    useStore.setState({ featureFlags: { kid_game_sounds: false } });
    audio.sfx('correct');
    assert.equal(state.oscillators, 0, 'game sounds must be silent while the flag is off');
  });

  it('flag ON → sfx() fires a cue', () => {
    useStore.setState({ featureFlags: { kid_game_sounds: true } });
    audio.sfx('correct');
    assert.ok(state.oscillators > 0, 'cue plays when the flag is on');
  });
});

describe('kid_voiceover flag gate', () => {
  let audio: typeof import('./index');
  let spoken: string[];

  beforeEach(async () => {
    spoken = [];
    // Minimal fake Web Speech surface (jsdom implements neither). voice.ts reads
    // `window.speechSynthesis` but constructs the bare global
    // `SpeechSynthesisUtterance`, so both objects must carry the stubs.
    const synth = {
      speak: (u: { text: string }) => spoken.push(u.text),
      cancel: () => {},
      getVoices: () => [{ lang: 'fr-FR', default: true, name: 'fake' }],
    };
    class FakeUtterance {
      voice: unknown; lang = ''; rate = 1; pitch = 1;
      onend: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    (window as unknown as Record<string, unknown>).speechSynthesis = synth;
    (globalThis as unknown as Record<string, unknown>).speechSynthesis = synth;
    (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
    (globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
    audio = await import('./index');
    audio.setEnabled(true);
  });

  it('flag OFF → speak() never reaches the synth', async () => {
    useStore.setState({ featureFlags: { kid_voiceover: false } });
    audio.speak('bonjour', 'fr');
    await tick();
    assert.equal(spoken.length, 0, 'no narration while the voiceover flag is off');
  });

  it('flag ON → speak() reaches the synth', async () => {
    useStore.setState({ featureFlags: { kid_voiceover: true } });
    audio.speak('bonjour', 'fr');
    await tick();
    assert.deepEqual(spoken, ['bonjour'], 'narration passes through when the flag is on');
  });
});
