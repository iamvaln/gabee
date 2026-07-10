import { useCallback, useEffect, useState } from 'react';
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
 * `onComplete` fires once when the last step matches OR the kid skips.
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

  // Fresh puzzle (new script identity) → start over.
  useEffect(() => { setState(initGuideState()); }, [script]);

  const active = enabled && !state.done && script.length > 0;
  const step = active ? (script[state.stepIndex] ?? null) : null;

  const report = useCallback(
    (a: GuideActionKind) => {
      setState((prev) => {
        if (!enabled || prev.done || script.length === 0) return prev;
        const { state: next, completed } = advanceGuide(prev, script, a);
        if (completed) onComplete();
        return next;
      });
    },
    [enabled, script, onComplete],
  );

  const skip = useCallback(() => {
    setState((prev) => {
      if (prev.done) return prev;
      onComplete();
      return { ...prev, done: true };
    });
  }, [onComplete]);

  const restart = useCallback(() => { setState(initGuideState()); }, []);

  return { active, step, stepIndex: state.stepIndex, report, skip, restart };
}
