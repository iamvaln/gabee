import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bee } from './Bee';

/**
 * 20-20-20 look-away pause (product §6.3). Forced full-screen overlay; the
 * countdown runs to zero, then the parent's `onDone` is fired automatically —
 * there is intentionally NO dismiss button. A kid who is doing the rest
 * properly is looking away from the screen anyway, so a button would only
 * tempt them to skip; a kid still staring at the screen reads the timer and
 * waits it out.
 *
 * Bulletproof input blocking: the spec only guarantees `position: fixed`
 * blocks click/touch when our overlay also wins the stacking-context fight
 * AND no ancestor accidentally turns into a containing block. We belt-and-
 * brace it with a max-int z-index, explicit pointer-events: auto,
 * touch-action: none, stop-propagation on every pointer/key event, and a
 * body-scroll lock so a swipe behind the overlay can't move the game.
 */
export function LookAwayOverlay({
  pauseSec,
  onDone,
}: {
  pauseSec: number;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(pauseSec);

  // Pick ONE break action at random, once per pause. `pick` is frozen in state
  // so the per-second countdown re-renders don't reshuffle the suggestion.
  // Falls back to the generic body if the actions list is somehow missing.
  const actionsRaw = t('lookAway.actions', { returnObjects: true }) as unknown;
  const actions = Array.isArray(actionsRaw) ? (actionsRaw as string[]) : [];
  const [pick] = useState(() => Math.random());
  const action = actions.length > 0 ? actions[Math.floor(pick * actions.length)]! : t('lookAway.body');

  // Countdown — once per second. Auto-dismiss when it hits zero so the kid
  // doesn't have to tap anything.
  useEffect(() => {
    if (remaining <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setRemaining((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [remaining, onDone]);

  // Lock body scroll for the duration of the overlay so a stray swipe under
  // it can't move the game. Restore previous value on unmount, never blanket-
  // clear, in case a parent component already had a scroll lock.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Swallow every pointer / key event so a tap or keypress that lands on
  // the overlay never reaches anything below — even if some browser quirk
  // would otherwise pass it through (e.g. a `disabled` button still firing
  // pointerup on some Android WebViews).
  const swallow = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div
      // Fixed + viewport-sized + ridiculous z-index + no touch passthrough.
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2147483647, // max 32-bit signed int — wins every stacking war
        pointerEvents: 'auto',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      role="dialog"
      aria-modal="true"
      onClick={swallow}
      onPointerDown={swallow}
      onPointerUp={swallow}
      onTouchStart={swallow}
      onTouchEnd={swallow}
      onKeyDown={swallow}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 24,
          padding: 32,
          maxWidth: 480,
          textAlign: 'center',
        }}
      >
        <Bee size={120} expression="idle" wings bob />
        <h2 style={{ marginTop: 16, fontSize: 22, color: '#64748b', fontWeight: 700 }}>
          {t('lookAway.title')}
        </h2>
        <p style={{ marginTop: 10, fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>
          {action}
        </p>
        <div
          aria-live="polite"
          style={{
            marginTop: 24,
            fontSize: 56,
            fontWeight: 800,
            color: remaining <= 0 ? '#22c55e' : '#0f172a',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {remaining > 0 ? remaining : '✓'}
        </div>
        <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>
          {t('lookAway.comesBack')}
        </p>
      </div>
    </div>
  );
}
