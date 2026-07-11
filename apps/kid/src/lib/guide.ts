/**
 * Guided-onboarding engine (Code v1). Pure and framework-agnostic: a GuideScript
 * is a linear list of steps, each waiting for one kid action before advancing.
 * `advanceGuide` is the whole state machine; `useGuide` (separate file) is a thin
 * React wrapper. Persistence marks a (profile, sub-mode) guide as seen so it shows
 * once. See docs/superpowers/specs/2026-07-10-code-guided-onboarding-design.md.
 */

export type GuideActionKind =
  | 'block-placed'  // a move arrow was added to the program
  | 'pick-placed'   // the ✋ pick command was added
  | 'drop-placed'   // the 📥 drop command was added
  | 'run-pressed'   // ▶ Run pressed
  | 'success';      // the run succeeded

export interface GuideStep {
  /** Bilingual coach line, rendered by lang at display time. */
  coach: { fr: string; en: string };
  /** Anchor key of the element the 👇 pointer targets (see session anchors). */
  target?: string;
  /** The action that advances to the next step. */
  advanceOn: GuideActionKind;
  /** Interactive anchor keys enabled this step; everything else is gated off. */
  allow: string[];
}

export type GuideScript = GuideStep[];

export interface GuideState {
  stepIndex: number;
  done: boolean;
}

export function initGuideState(): GuideState {
  return { stepIndex: 0, done: false };
}

/**
 * Advance the guide if `action` matches the current step's `advanceOn`.
 * Returns the next state and whether the guide just completed (last step matched).
 */
export function advanceGuide(
  state: GuideState,
  script: GuideScript,
  action: GuideActionKind,
): { state: GuideState; completed: boolean } {
  if (state.done) return { state, completed: false };
  const step = script[state.stepIndex];
  if (!step || action !== step.advanceOn) return { state, completed: false };
  const isLast = state.stepIndex >= script.length - 1;
  if (isLast) return { state: { stepIndex: state.stepIndex, done: true }, completed: true };
  return { state: { stepIndex: state.stepIndex + 1, done: false }, completed: false };
}

export function guideSeenKey(profileId: string | null, subKey: string): string {
  return `gabee:guide-seen:${profileId ?? 'anon'}:${subKey}`;
}

export function guideSeen(profileId: string | null, subKey: string): boolean {
  try {
    return localStorage.getItem(guideSeenKey(profileId, subKey)) === '1';
  } catch {
    return false;
  }
}

export function markGuideSeen(profileId: string | null, subKey: string): void {
  try {
    localStorage.setItem(guideSeenKey(profileId, subKey), '1');
  } catch {
    /* storage unavailable — guide simply re-shows next time; acceptable */
  }
}
