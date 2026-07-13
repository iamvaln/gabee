// Procedural cue catalog — every cue is a few enveloped sine/triangle notes in
// the A-major motif family of the original message ding (spec §4). Data-only
// at module scope so the table is unit-testable under plain node.
import { getAudioContext } from './context';

export interface CueNote {
  freq: number;
  /** Offset from cue start, seconds. */
  at: number;
  dur: number;
  peak: number;
  type?: OscillatorType;
}

export const CUE_NAMES = [
  'correct',
  'wrong',
  'tap',
  'navSelect',
  'unlock',
  'milestone',
  'message',
  'sessionStart',
] as const;
export type CueName = (typeof CUE_NAMES)[number];

// Motif family: A5 880 · C#6 1108.73 · E6 1318.5 · A6 1760 · E5 659.25 · E4 329.63
export const CUES: Record<CueName, CueNote[]> = {
  // Bright rising two-note — same interval as the ding, snappier.
  correct: [
    { freq: 880, at: 0, dur: 0.3, peak: 0.1 },
    { freq: 1318.5, at: 0.08, dur: 0.35, peak: 0.09 },
  ],
  // Soft low single "boop" — encouraging, never a buzzer.
  wrong: [{ freq: 329.63, at: 0, dur: 0.25, peak: 0.06 }],
  // Very short tick (catalog-only for now — wiring deferred to tuning QA).
  tap: [{ freq: 1760, at: 0, dur: 0.15, peak: 0.03, type: 'triangle' }],
  // Subtle blip for BottomNav tab changes.
  navSelect: [{ freq: 1108.73, at: 0, dur: 0.15, peak: 0.05, type: 'triangle' }],
  // Small sparkle arpeggio (catalog-only for now — no map transition exists yet).
  unlock: [
    { freq: 880, at: 0, dur: 0.2, peak: 0.08 },
    { freq: 1108.73, at: 0.07, dur: 0.2, peak: 0.08 },
    { freq: 1318.5, at: 0.14, dur: 0.25, peak: 0.08 },
  ],
  // Fuller celebratory sting for badges/gifts.
  milestone: [
    { freq: 880, at: 0, dur: 0.5, peak: 0.1 },
    { freq: 1108.73, at: 0.1, dur: 0.5, peak: 0.09 },
    { freq: 1318.5, at: 0.2, dur: 0.5, peak: 0.09 },
    { freq: 1760, at: 0.3, dur: 0.5, peak: 0.08 },
  ],
  // EXACT legacy playMsgDing tones — MessageBandeau must sound identical.
  message: [
    { freq: 880, at: 0, dur: 0.5, peak: 0.12 },
    { freq: 1318.5, at: 0.1, dur: 0.5, peak: 0.09 },
  ],
  // Gentle "here we go" (catalog-only for now — cut-first-if-noisy, spec §4).
  sessionStart: [
    { freq: 659.25, at: 0, dur: 0.3, peak: 0.06 },
    { freq: 880, at: 0.1, dur: 0.35, peak: 0.07 },
  ],
};

/** Synthesize one cue. Throws only inside the try — callers get silence, never errors. */
export function playCue(name: CueName): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const n of CUES[name]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = n.type ?? 'sine';
      o.frequency.value = n.freq;
      g.gain.setValueAtTime(0, now + n.at);
      g.gain.linearRampToValueAtTime(n.peak, now + n.at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + n.at);
      o.stop(now + n.at + n.dur + 0.02);
    }
  } catch {
    /* audio may be gesture-gated; ignore */
  }
}
