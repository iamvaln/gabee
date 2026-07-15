// Shared AudioContext for every procedural cue. Absorbs the window.__gabeeAudio
// slot the legacy playMsgDing used, so pre-existing contexts are reused.
// Audio may be gesture-gated; callers swallow errors so a missing context never
// breaks a render (spec §7).
interface MaybeAudio {
  __gabeeAudio?: AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

export function getAudioContext(): AudioContext | null {
  const w = window as Window & MaybeAudio;
  // A pre-existing (real or test-installed fake) context is always reused,
  // even where no AudioContext constructor is available (e.g. jsdom, which
  // has no Web Audio API — module tests inject a fake via this slot).
  let ctx = w.__gabeeAudio;
  if (!ctx) {
    const AC = window.AudioContext || w.webkitAudioContext;
    if (!AC) return null;
    ctx = w.__gabeeAudio = new AC();
  }
  // Gesture-gated rejection is expected here (autoplay policy); swallow it —
  // an unhandled rejection would otherwise reach Sentry as noise.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
