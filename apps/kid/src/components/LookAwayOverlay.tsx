import { useEffect, useState } from 'react';
import { Bee } from './Bee';

/**
 * 20-20-20 look-away pause (product §6.3). Forced full-screen overlay; on dismiss,
 * the parent calls `acknowledgeLookAway()` to reset the timer. The kid can't
 * skip the pause — countdown runs to zero before "Continuer" enables.
 */
export function LookAwayOverlay({
  pauseSec,
  lang,
  onDone,
}: {
  pauseSec: number;
  lang: 'fr' | 'en';
  onDone: () => void;
}) {
  const [remaining, setRemaining] = useState(pauseSec);

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const ready = remaining <= 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          background: 'white', borderRadius: 24, padding: 32,
          maxWidth: 480, textAlign: 'center',
        }}
      >
        <Bee size={120} expression="idle" wings bob />
        <h2 style={{ marginTop: 16, fontSize: 24, color: '#0f172a' }}>
          {lang === 'fr' ? 'Regarde au loin' : 'Look far away'}
        </h2>
        <p style={{ marginTop: 8, color: '#64748b' }}>
          {lang === 'fr'
            ? 'Repose tes yeux quelques secondes — regarde quelque chose loin de l’écran.'
            : 'Rest your eyes — look at something far from the screen.'}
        </p>
        <div style={{ marginTop: 24, fontSize: 48, fontWeight: 800, color: ready ? '#22c55e' : '#0f172a' }}>
          {ready ? '✓' : remaining}
        </div>
        <button
          className="btn"
          disabled={!ready}
          onClick={onDone}
          style={{ marginTop: 16 }}
        >
          {lang === 'fr' ? 'Continuer' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
