import { useTranslation } from 'react-i18next';
import type { ChildProfile } from '@gabee/types';
import { Bee } from './Bee';
import { Icon } from './Icon';
import { ProfileAvatar } from './Chrome';

const INK = '#0f172a';
const CREAM = '#FFFBEC';
const CYAN = '#BBEAF2';
const MUTED = '#64748b';

/**
 * Idle lock screen (product §6.3). Appears after `IDLE_LOCK_MS` of inactivity
 * or after a long background. The current kid's avatar fills most of the
 * surface as a single big tap target — they unlock by tapping their own face
 * (a breathing halo behind it signals "tap me"). A clearly-subordinate
 * "switch profile" pill below covers the sibling case, so a kid who picks up
 * the device doesn't accidentally rack progress on the wrong profile.
 *
 * Visually deliberate: ONE primary CTA (the avatar) + a SECONDARY, real button
 * (ghost pill, not a bare text link) so the sibling path reads as an action but
 * never competes with resume.
 */
export function LockScreen({
  profile,
  onResume,
  onSwitchProfile,
}: {
  profile: ChildProfile;
  onResume: () => void;
  onSwitchProfile: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: CREAM,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, zIndex: 9800,
      }}
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes gabee-lock-halo {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.07); opacity: 0.85; }
        }
        .gabee-lock-halo { animation: gabee-lock-halo 2.6s ease-in-out infinite; }
        .gabee-lock-resume { transition: transform 160ms ease; }
        .gabee-lock-resume:active { transform: scale(0.96); }
        .gabee-lock-resume:focus-visible { outline: 4px solid ${CYAN}; outline-offset: 8px; border-radius: 28px; }
        .gabee-lock-switch { transition: transform 140ms ease, background 140ms ease, box-shadow 140ms ease; }
        .gabee-lock-switch:hover { background: #ffffff; box-shadow: 0 4px 14px rgba(15,23,42,0.12); }
        .gabee-lock-switch:active { transform: scale(0.97); }
        .gabee-lock-switch:focus-visible { outline: 3px solid ${CYAN}; outline-offset: 3px; }
        @media (prefers-reduced-motion: reduce) {
          .gabee-lock-halo { animation: none; }
        }
      `}</style>

      <Bee size={72} expression="idle" wings />
      <h1 style={{ marginTop: 14, marginBottom: 0, fontSize: 19, color: MUTED, textAlign: 'center', fontWeight: 700, letterSpacing: 0.2 }}>
        {t('lock.tapToResume')}
      </h1>

      {/* Primary CTA: tap your own face to resume */}
      <button
        className="gabee-lock-resume"
        onClick={onResume}
        aria-label={t('lock.resumeAs', { name: profile.name })}
        style={{
          marginTop: 26, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        }}
      >
        <span style={{ position: 'relative', width: 236, height: 236, display: 'grid', placeItems: 'center' }}>
          <span
            aria-hidden
            className="gabee-lock-halo"
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: `radial-gradient(closest-side, ${CYAN}, rgba(187,234,242,0))`,
            }}
          />
          <span
            style={{
              position: 'relative', width: 208, height: 208, borderRadius: '50%',
              border: `6px solid ${INK}`, overflow: 'hidden', background: '#fff',
              boxShadow: '0 14px 30px rgba(15,23,42,0.20)',
              display: 'grid', placeItems: 'center',
            }}
          >
            <ProfileAvatar profile={profile} size={196} />
          </span>
        </span>
        <span style={{ fontSize: 26, fontWeight: 800, color: INK, lineHeight: 1 }}>{profile.name}</span>
      </button>

      {/* Secondary, clearly-subordinate: sibling picks up the device */}
      <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 340 }}>
        <button
          className="gabee-lock-switch"
          onClick={onSwitchProfile}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            minHeight: 48, padding: '0 20px', borderRadius: 999,
            background: 'rgba(255,255,255,0.55)', border: `2px solid ${INK}`,
            color: INK, fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Icon name="refresh" size={20} />
          {t('lock.switchProfile')}
        </button>
        <p style={{ margin: 0, fontSize: 13.5, color: MUTED, textAlign: 'center', lineHeight: 1.4, fontWeight: 600 }}>
          {t('lock.notYou', { name: profile.name })}
        </p>
      </div>
    </div>
  );
}
