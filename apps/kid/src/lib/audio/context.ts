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
  const AC = window.AudioContext || w.webkitAudioContext;
  if (!AC) return null;
  const ctx = w.__gabeeAudio ?? (w.__gabeeAudio = new AC());
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
