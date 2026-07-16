// apps/kid/src/lib/audio/music.dom.test.tsx
// Engine behavior against a fake AudioContext + fake fetch (audio phase E spec
// §7.2): looping source on ambient, ramped stop on silent, hard gates off.
import '../../test/setup-dom';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

interface FakeSource {
  buffer: unknown; loop: boolean; started: boolean; stopped: boolean;
  connect: (n: unknown) => void; start: () => void; stop: () => void;
}

function installFakeAudio() {
  const state = { sources: [] as FakeSource[], ramps: [] as number[] };
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
        linearRampToValueAtTime: (v: number) => state.ramps.push(v),
      },
      connect: () => {},
    }),
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

describe('music engine (fake AudioContext)', () => {
  let audio: typeof import('./index');
  let state: ReturnType<typeof installFakeAudio>;

  beforeEach(async () => {
    state = installFakeAudio();
    audio = await import('./index');
    audio.setEnabled(true);
    audio.setMusicEnabled(true);
    audio.setMusicZone('silent'); // settle to a known state between tests
    await tick();
    state.sources.length = 0;
    state.ramps.length = 0;
  });

  it('ambient zone starts a looping source (after async decode)', async () => {
    audio.setMusicZone('ambient');
    await tick(); await tick(); // fetch → decode → reevaluate
    const s = state.sources.at(-1);
    assert.ok(s?.started, 'source started');
    assert.equal(s?.loop, true, 'loop must be gapless');
    assert.ok(state.ramps.includes(0.22), 'fade-in targets VOLUME');
  });

  it('silent zone stops the source with a fade-out ramp', async () => {
    audio.setMusicZone('ambient');
    await tick(); await tick();
    audio.setMusicZone('silent');
    const s = state.sources.at(-1);
    assert.ok(s?.stopped, 'source stopped');
    assert.ok(state.ramps.includes(0), 'fade-out targets 0');
  });

  it('music switch off prevents start and stops playback', async () => {
    audio.setMusicZone('ambient');
    await tick(); await tick();
    audio.setMusicEnabled(false);
    assert.ok(state.sources.at(-1)?.stopped, 'toggle-off stops music');
    state.sources.length = 0;
    audio.setMusicZone('ambient');
    await tick(); await tick();
    assert.equal(state.sources.length, 0, 'no source while music pref is off');
  });

  it('master switch off silences music too', async () => {
    audio.setMusicZone('ambient');
    await tick(); await tick();
    audio.setEnabled(false);
    assert.ok(state.sources.at(-1)?.stopped, 'master-off stops music');
  });

  // Fix 1 regression: App.tsx's zoning effect used to clean up with
  // `setMusicZone('silent')` between EVERY re-run, so an ambient→ambient
  // route change (no lock/session screen in between) stopped and restarted
  // the loop from t=0. The engine itself must treat re-affirming the same
  // zone as a no-op.
  it('ambient→ambient with no silent in between is a no-op (loop keeps playing)', async () => {
    audio.setMusicZone('ambient');
    await tick(); await tick();
    const first = state.sources.at(-1);
    assert.ok(first?.started, 'first source started');
    assert.equal(state.sources.length, 1, 'exactly one source created');

    audio.setMusicZone('ambient'); // route-change-like re-fire, still ambient
    await tick(); await tick();

    assert.equal(state.sources.length, 1, 'no second source created');
    assert.equal(first?.stopped, false, 'the original source was never stopped');
  });

  // Fix 5 / spec §7.2: a gesture-locked context must not throw and must not
  // start until the next user gesture, then must catch up once unlocked.
  it('locked context: waits for a gesture before starting playback', async () => {
    const fakeCtx = (window as unknown as {
      __gabeeAudio: { state: string; resume: () => Promise<void> };
    }).__gabeeAudio;
    fakeCtx.state = 'suspended';
    // Deferred flip (not synchronous): getAudioContext() itself calls resume()
    // whenever it sees a suspended context, so a synchronous flip would
    // silently unlock start()'s very first attempt before its own check runs.
    fakeCtx.resume = () => Promise.resolve().then(() => {
      fakeCtx.state = 'running';
    });

    audio.setMusicZone('ambient');
    await tick();
    assert.equal(state.sources.length, 0, 'no source while the context is gesture-locked');

    document.dispatchEvent(new window.Event('pointerdown'));
    await tick(); await tick(); await tick();

    const s = state.sources.at(-1);
    assert.ok(s?.started, 'source started once the context unlocked');
    assert.equal(s?.loop, true, 'loop must be gapless');
  });
});
