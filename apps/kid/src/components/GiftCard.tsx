import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KidGift } from '@gabee/types';
import { Bee } from './Bee';
import { sfx } from '../lib/audio';

/**
 * Loyalty / compensation gift card. A full-screen celebratory overlay shown when a
 * kid has a pending gift. Tapping "Accept the gift" calls `onClaim` (which adds the
 * bonus to total_stars server-side, auditable) then shows the claimed state; the kid
 * taps Continue to dismiss. `onClaim` should resolve only on a successful claim.
 */
export function GiftCard({
  gift,
  onClaim,
  onDismiss,
}: {
  gift: KidGift;
  onClaim: () => Promise<void>;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'idle' | 'claiming' | 'claimed' | 'error'>('idle');

  async function claim() {
    setPhase('claiming');
    try {
      await onClaim();
      sfx('milestone');
      setPhase('claimed');
    } catch {
      setPhase('error');
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          textAlign: 'center',
          background: 'var(--surface, #FFFBEC)',
          border: '3px solid #0f172a',
          borderRadius: 28,
          boxShadow: '0 16px 0 rgba(15,23,42,0.85)',
          padding: '28px 24px 24px',
        }}
      >
        <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 4 }}>🎁</div>
        <Bee size={92} expression="celebrate" wings bob />
        <h2 style={{ margin: '8px 0 4px', fontSize: 24 }}>{t('gift.title')}</h2>
        <p style={{ margin: '0 0 14px', fontSize: 15, opacity: 0.85 }}>{gift.label}</p>

        <div
          style={{
            fontWeight: 800,
            fontSize: 34,
            color: '#f59e0b',
            margin: '0 0 18px',
          }}
        >
          +{gift.amount} ⭐
        </div>

        {phase === 'idle' && (
          <button className="btn large mint" style={{ width: '100%' }} onClick={() => void claim()}>
            {t('gift.accept')}
          </button>
        )}
        {phase === 'claiming' && (
          <button className="btn large mint" style={{ width: '100%' }} disabled>
            {t('gift.claiming')}
          </button>
        )}
        {phase === 'claimed' && (
          <>
            <div style={{ fontWeight: 700, color: '#166534', marginBottom: 14 }}>
              {t('gift.claimed', { count: gift.amount })}
            </div>
            <button className="btn large" style={{ width: '100%' }} onClick={onDismiss}>
              {t('gift.continue')}
            </button>
          </>
        )}
        {phase === 'error' && (
          <>
            <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 14 }}>
              {t('gift.error')}
            </div>
            <button className="btn large mint" style={{ width: '100%' }} onClick={() => void claim()}>
              {t('gift.retry')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
