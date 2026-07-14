// The enabled-pref lives in the zustand store (persisted + profile-seeded, see
// store.ts). This wrapper keeps the audio module the only consumer surface.
import { useStore } from '../../store';

export function isEnabled(): boolean {
  return useStore.getState().audioEnabled;
}

/** Local flip only — the best-effort PATCH to the API is the Settings screen's job. */
export function setEnabled(v: boolean): void {
  useStore.getState().setAudioEnabled(v);
}
