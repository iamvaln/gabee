// apps/kid/src/lib/audio/index.ts
// THE audio boundary (spec §2). Screens import sfx()/speak()/… from here and
// never touch AudioContext or speechSynthesis directly.
import { playCue, type CueName } from './sfx';
import { isEnabled, isMusicEnabled, setEnabled as setEnabledPref, setMusicEnabled as setMusicEnabledPref } from './prefs';
import { WebSpeechVoiceProvider, type VoiceProvider } from './voice';
import { setMusicZone as musicSetZone, reevaluateMusic as reevaluateMusicImpl, type MusicZone } from './music';
import { isFeatureEnabled } from '../flags';

export type { CueName, VoiceProvider, MusicZone };
export { isEnabled, isMusicEnabled };

// v0.1 provider — the one line to change for the recorded-voices upgrade (Phase D).
const provider = new WebSpeechVoiceProvider();

/** Voiceover is on only when the master switch AND the admin flag both allow it. */
function voiceEnabled(): boolean {
  return isEnabled() && isFeatureEnabled('kid_voiceover');
}

/**
 * Fire a procedural cue. No-ops when audio is off, and while narration is
 * speaking (spec: no ducking in v0.1 — suppression instead). Never throws.
 */
export function sfx(name: CueName): void {
  try {
    if (!isEnabled() || provider.speaking) return;
    playCue(name);
  } catch {
    /* never break a render over audio */
  }
}

/** Narrate a prompt. Fire-and-forget; replaces any current narration. */
export function speak(text: string, lang: 'fr' | 'en'): void {
  if (!voiceEnabled()) return;
  // A new prompt narration must abandon any pending speakSuccess chain —
  // stop() bumps the generation — otherwise stale praise cancels the new prompt.
  provider.stop();
  void provider.speak(text, lang).catch(() => {});
}

/**
 * Success narration (spec §5): the word again, then a spoken praise. Delayed
 * 400ms so the `correct` cue lands first; abandoned silently if the child
 * moves on (stopSpeaking bumps the generation).
 */
export function speakSuccess(
  word: string,
  wordLang: 'fr' | 'en',
  praise: string,
  praiseLang: 'fr' | 'en',
): void {
  if (!voiceEnabled()) return;
  const gen = provider.generation;
  window.setTimeout(() => {
    if (provider.generation !== gen || !voiceEnabled()) return;
    void provider
      .speak(word, wordLang)
      .then(() => {
        if (provider.generation === gen && voiceEnabled()) return provider.speak(praise, praiseLang);
      })
      .catch(() => {});
  }, 400);
}

/** Synchronous + cheap — safe inside hot key handlers ("never blocks input"). */
export function stopSpeaking(): void {
  provider.stop();
}

/** Call from any user-gesture handler; idempotent. */
export function warmVoice(): void {
  try {
    provider.warm?.();
  } catch {
    /* ignore */
  }
}

/** Flip the master switch. Turning OFF also silences any in-flight narration. */
export function setEnabled(v: boolean): void {
  setEnabledPref(v);
  if (!v) provider.stop();
  reevaluateMusicImpl();
}

/** Route-driven music zoning; idempotent, never throws (spec §2). */
export function setMusicZone(zone: MusicZone): void {
  try {
    musicSetZone(zone);
  } catch {
    /* music must never break a render */
  }
}

/** Ambient-music switch: flip pref, settle playback immediately. */
export function setMusicEnabled(v: boolean): void {
  setMusicEnabledPref(v);
  reevaluateMusicImpl();
}

/** Re-settle playback against the current zone × prefs; idempotent, never
 *  throws (spec §2). Callers: profile switch (a new kid's music_enabled just
 *  seeded) needs this re-evaluated without waiting on a route/zone change. */
export function reevaluateMusic(): void {
  try {
    reevaluateMusicImpl();
  } catch {
    /* music must never break a render */
  }
}
