// apps/kid/src/lib/audio/music.ts
// Ambient-music layer (audio phase E spec §1). One bundled loop, played
// gaplessly via AudioBufferSourceNode.loop on the shared context, gated by
// zone (App.tsx routing) × master switch × music switch. Module-wide rule:
// fire-and-forget, error-swallowing, nothing at module scope touches window.
import { getAudioContext } from './context';
import { isEnabled, isMusicEnabled } from './prefs';

export type MusicZone = 'ambient' | 'silent';

/** URL is a public/ asset (plain string — node-safe, precached by Workbox).
 *  Placeholder .wav until the Suno-generated ambient-hub.m4a lands (spec §5). */
export const MUSIC_URL = '/music/ambient-hub.wav';
const VOLUME = 0.22;
const FADE_S = 0.8;

/** Pure gate — unit-tested; the only decision logic in this module. */
export function shouldPlayMusic(zone: MusicZone, master: boolean, music: boolean): boolean {
  return zone === 'ambient' && master && music;
}

let zone: MusicZone = 'silent';
let buffer: AudioBuffer | null = null;
let loading = false;
// Transient blips get retries; a genuinely broken asset stops being fetched on every navigation.
let loadAttempts = 0;
const MAX_LOAD_ATTEMPTS = 3;
let source: AudioBufferSourceNode | null = null;
let gain: GainNode | null = null;

async function ensureBuffer(): Promise<AudioBuffer | null> {
  if (buffer) return buffer;
  if (loading || loadAttempts >= MAX_LOAD_ATTEMPTS) return null; // concurrent load re-evaluates when done; exhausted = give up
  loading = true;
  loadAttempts++;
  try {
    const ctx = getAudioContext();
    if (!ctx) return null;
    const res = await fetch(MUSIC_URL);
    buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    loadAttempts = 0; // decoded fine — the asset is healthy
    return buffer;
  } catch {
    return null; // missing/undecodable asset must never break the app
  } finally {
    loading = false;
    // The zone may have changed while decoding — settle to the correct state.
    reevaluateMusic();
  }
}

/** One-shot: when the context is gesture-locked, retry at the next user gesture. */
let unlockArmed = false;
function armUnlockRetry(): void {
  if (unlockArmed || typeof document === 'undefined') return;
  unlockArmed = true;
  const onGesture = () => {
    document.removeEventListener('pointerdown', onGesture);
    document.removeEventListener('keydown', onGesture);
    unlockArmed = false;
    const ctx = getAudioContext(); // getAudioContext() resumes a suspended context
    void ctx?.resume?.().catch(() => {}).finally?.(reevaluateMusic);
    reevaluateMusic();
  };
  document.addEventListener('pointerdown', onGesture);
  document.addEventListener('keydown', onGesture);
}

function start(): void {
  if (source) return; // already playing
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') {
    // Autoplay policy: locked until a user gesture — retry on the next one
    // (a cold launch onto the hub must start music at the first tap, spec §1).
    armUnlockRetry();
    return;
  }
  if (!buffer) {
    void ensureBuffer();
    return; // ensureBuffer's finally() re-evaluates once decoded
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + FADE_S);
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.connect(g);
  g.connect(ctx.destination);
  s.start();
  source = s;
  gain = g;
}

function stop(): void {
  const ctx = getAudioContext();
  const s = source, g = gain;
  source = null;
  gain = null;
  if (!s) return;
  try {
    if (ctx && g) {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_S);
      s.stop(ctx.currentTime + FADE_S + 0.02);
    } else {
      s.stop();
    }
  } catch {
    /* stopping twice / dead context — ignore */
  }
}

/** Idempotent: reads zone × prefs and settles playback to match. */
export function reevaluateMusic(): void {
  try {
    if (shouldPlayMusic(zone, isEnabled(), isMusicEnabled())) start();
    else stop();
  } catch {
    /* music must never break a render */
  }
}

/** App.tsx routing calls this on every route change (spec §2). */
export function setMusicZone(next: MusicZone): void {
  zone = next;
  reevaluateMusic();
}
