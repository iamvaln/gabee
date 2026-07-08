import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BadgeId } from '@gabee/types';
import { Bee } from './Bee';
import { BADGE_LABELS } from '../lib/badges';

/**
 * Full-screen celebration that fires when the kid earns one or more new badges
 * (product §6.3 — consistency framing). Calm + positive: the reward reads as an
 * earned MEDAL (gold medallion + ribbon on a soft sunburst), not a confetti
 * storm. Each medal pops in once then breathes gently. The kid taps to dismiss;
 * the parent then writes the seen-set so the same badges don't fire twice.
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

  const { t } = useTranslation();

  if (!open || badges.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(255,251,236,0.97)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 9500, padding: 24, overflow: 'hidden',
      }}
      role="dialog"
      aria-modal="true"
      onClick={() => { setOpen(false); onDone(); }}
    >
      <style>{`
        @keyframes gabee-medal-pop {
          0% { transform: scale(0.4); opacity: 0; }
          70% { transform: scale(1.06); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes gabee-medal-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7px); }
        }
        @keyframes gabee-rays-in {
          from { transform: scale(0.7); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .gabee-medal-unit {
          animation: gabee-medal-pop 460ms cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .gabee-medal-unit .gabee-medal {
          animation: gabee-medal-bob 2.6s ease-in-out infinite;
        }
        .gabee-rays { animation: gabee-rays-in 600ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .gabee-medal-unit, .gabee-medal-unit .gabee-medal, .gabee-rays { animation: none !important; }
        }
      `}</style>

      {/* Soft static sunburst behind the medals — reward warmth, no confetti. */}
      <span
        aria-hidden
        className="gabee-rays"
        style={{
          position: 'absolute', top: '50%', left: '50%', width: 620, height: 620,
          transform: 'translate(-50%,-50%)', pointerEvents: 'none',
          background: 'repeating-conic-gradient(from 8deg, rgba(245,179,1,0.13) 0deg 7deg, rgba(245,179,1,0) 7deg 15deg)',
          WebkitMaskImage: 'radial-gradient(circle, #000 0%, #000 24%, rgba(0,0,0,0) 60%)',
          maskImage: 'radial-gradient(circle, #000 0%, #000 24%, rgba(0,0,0,0) 60%)',
        }}
      />

      <Bee size={132} expression="celebrate" wings bob />
      <h1 style={{ marginTop: 12, marginBottom: 0, fontSize: 28, fontWeight: 800, color: '#20242e', textAlign: 'center', textWrap: 'balance', position: 'relative' }}>
        {t('milestone.newBadge', { count: badges.length })}
      </h1>

      <div
        style={{
          marginTop: 24, display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center',
          maxWidth: 620, position: 'relative',
        }}
      >
        {badges.map((id, i) => {
          const meta = BADGE_LABELS[id];
          return (
            <div
              key={id}
              className="gabee-medal-unit"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                animationDelay: `${120 + i * 110}ms`,
              }}
            >
              {/* medallion + ribbon */}
              <span style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
                {/* ribbon tails, behind the disc */}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', top: '58%', width: 74, height: 60, zIndex: 0,
                    display: 'flex', justifyContent: 'space-between',
                  }}
                >
                  <span style={{ width: 26, height: 56, background: '#2BD4E6', borderRight: '2px solid #20242e', borderLeft: '2px solid #20242e', clipPath: 'polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)', transform: 'rotate(-8deg)' }} />
                  <span style={{ width: 26, height: 56, background: '#2BD4E6', borderRight: '2px solid #20242e', borderLeft: '2px solid #20242e', clipPath: 'polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)', transform: 'rotate(8deg)' }} />
                </span>
                {/* gold disc */}
                <span
                  className="gabee-medal"
                  style={{
                    position: 'relative', zIndex: 1,
                    width: 116, height: 116, borderRadius: '50%',
                    background: 'radial-gradient(circle at 38% 32%, #FFEDA8 0%, #F7BE24 52%, #E08A00 100%)',
                    border: '5px solid #20242e',
                    boxShadow: 'inset 0 0 0 5px rgba(255,255,255,0.35), 0 12px 24px rgba(224,138,0,0.38)',
                    display: 'grid', placeItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 46, lineHeight: 1, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))' }}>
                    {meta.icon}
                  </span>
                </span>
              </span>
              {/* label pill */}
              <span
                style={{
                  fontSize: 14, fontWeight: 800, color: '#20242e', textAlign: 'center',
                  background: '#fff', border: '2px solid #20242e', borderRadius: 999,
                  padding: '5px 14px', lineHeight: 1.1,
                }}
              >
                {meta[lang]}
              </span>
            </div>
          );
        })}
      </div>

      <p
        style={{
          marginTop: 26, marginBottom: 0, color: '#64748b', fontSize: 14, fontWeight: 600,
          position: 'relative',
        }}
      >
        {t('milestone.tapToContinue')}
      </p>
    </div>
  );
}
