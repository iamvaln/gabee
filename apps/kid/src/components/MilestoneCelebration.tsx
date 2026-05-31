import { useEffect, useState } from 'react';
import type { BadgeId } from '@gabee/types';
import { Bee } from './Bee';
import { BADGE_LABELS } from '../lib/badges';

/**
 * Full-screen celebration that fires when the kid earns one or more new badges
 * (product §6.3 — consistency framing). Calm + positive: confetti is implied
 * by a few bobbing badge tiles, NOT by a flashy animation. The kid taps to
 * dismiss; the parent then writes the seen-set so the same badges don't fire
 * twice.
 */
export function MilestoneCelebration({
  badges,
  lang,
  onDone,
}: {
  badges: BadgeId[];
  lang: 'fr' | 'en';
  onDone: () => void;
}) {
  const [open, setOpen] = useState(true);

  // Auto-fade after 6s if untouched — Summary then still has the BadgeRow below.
  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(false);
      onDone();
    }, 6000);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!open || badges.length === 0) return null;
  const L = lang === 'fr';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(255,251,236,0.96)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 9500, padding: 24,
      }}
      role="dialog"
      aria-modal="true"
      onClick={() => { setOpen(false); onDone(); }}
    >
      <Bee size={140} expression="celebrate" wings bob />
      <h1 style={{ marginTop: 16, fontSize: 28, color: '#0f172a', textAlign: 'center' }}>
        {L ? `Nouveau${badges.length > 1 ? 'x' : ''} badge${badges.length > 1 ? 's' : ''} !` : `New badge${badges.length > 1 ? 's' : ''}!`}
      </h1>
      <div
        style={{
          marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 600,
        }}
      >
        {badges.map((id) => {
          const meta = BADGE_LABELS[id];
          return (
            <div
              key={id}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '12px 16px', borderRadius: 16,
                background: '#FCD34D', border: '3px solid #B45309',
                minWidth: 120,
                animation: 'bob 1.8s ease-in-out infinite',
              }}
            >
              <span style={{ fontSize: 36 }}>{meta.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, marginTop: 6, textAlign: 'center' }}>
                {meta[lang]}
              </span>
            </div>
          );
        })}
      </div>
      <p style={{ marginTop: 20, color: '#64748b', fontSize: 14 }}>
        {L ? '(touche pour continuer)' : '(tap to continue)'}
      </p>
    </div>
  );
}
