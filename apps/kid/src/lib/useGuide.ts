import { useCallback, useEffect, useRef, useState } from 'react';
import {
  advanceGuide,
  initGuideState,
  type GuideActionKind,
  type GuideScript,
  type GuideState,
  type GuideStep,
} from './guide';

/**
 * React wrapper around the pure guide engine. `enabled` is the caller's decision
 * (first-exercise && !seen, OR a help-replay toggle). The hook resets whenever a
 * new `script` is passed (a new puzzle). `report` feeds kid actions to the engine;
 * `onComplete` fires exactly once when the guide reaches `done` (last step matched
 * OR the kid skipped).
 */
export function useGuide(
  script: GuideScript,
  enabled: boolean,
  onComplete: () => void,
): {
  active: boolean;
  step: GuideStep | null;
  stepIndex: number;
  report: (a: GuideActionKind) => void;
  skip: () => void;
  restart: () => void;
} {
  const [state, setState] = useState<GuideState>(initGuideState);
  const firedDone = useRef(false);

  // Fresh puzzle (new script identity) → start over.
  useEffect(() => {
    setState(initGuideState());
    firedDone.current = false;
  }, [script]);

  // Fire onComplete exactly once on the transition into `done`. Kept OUT of the
  // setState updater so React's double-invoke of updaters under StrictMode can't
  // fire the side effect twice.
  useEffect(() => {
    if (state.done && !firedDone.current) {
      firedDone.current = true;
      onComplete();
    }
  }, [state.done, onComplete]);

  const active = enabled && !state.done && script.length > 0;
  const step = active ? (script[state.stepIndex] ?? null) : null;

  const report = useCallback(
    (a: GuideActionKind) => {
      if (!enabled) return;
      setState((prev) => {
        if (prev.done || script.length === 0) return prev;
        return advanceGuide(prev, script, a).state;
      });
    },
    [enabled, script],
  );

  const skip = useCallback(() => {
    setState((prev) => (prev.done ? prev : { ...prev, done: true }));
  }, []);

  const restart = useCallback(() => {
    firedDone.current = false;
    setState(initGuideState());
  }, []);

  return { active, step, stepIndex: state.stepIndex, report, skip, restart };
}
