// THE audio boundary (spec §2). Screens import sfx()/speak()/… from here and
// never touch AudioContext or speechSynthesis directly.
import { playCue, type CueName } from './sfx';
import { isEnabled, setEnabled } from './prefs';

export type { CueName };
export { isEnabled, setEnabled };

/** Fire a procedural cue. No-ops when audio is off. Never throws. */
export function sfx(name: CueName): void {
  try {
    if (!isEnabled()) return;
    playCue(name);
  } catch {
    /* never break a render over audio */
  }
}
