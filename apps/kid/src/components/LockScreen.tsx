import type { ChildProfile } from '@gabee/types';
import { Bee } from './Bee';

/**
 * Idle lock screen (product §6.3). Appears after `IDLE_LOCK_MS` of inactivity
 * or after a long background. The current kid's avatar fills most of the
 * surface as a single tap target — they unlock by tapping their face. A
 * smaller text link below offers "Not me" → switch profile, so a sibling who
 * picks up the device doesn't accidentally rack progress on the wrong kid.
 *
 * Visually deliberate: a SINGLE big tap zone for the current kid (fast resume)
 * + a SECONDARY action for the sibling case (deliberate, requires a tap on
 * smaller text).
 */
export function LockScreen({
  profile,
  lang,
  onResume,
  onSwitchProfile,
}: {
  profile: ChildProfile;
  lang: 'fr' | 'en';
  onResume: () => void;
  onSwitchProfile: () => void;
}) {
  const L = lang === 'fr';
  const initial = profile.name.slice(0, 1).toUpperCase();

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#FFFBEC',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, zIndex: 9800,
      }}
      role="dialog"
      aria-modal="true"
    >
      <Bee size={80} expression="idle" wings />
      <h1 style={{ marginTop: 16, fontSize: 20, color: '#64748b', textAlign: 'center', fontWeight: 600 }}>
        {L ? 'Touche pour reprendre' : 'Tap to resume'}
      </h1>

      <button
        onClick={onResume}
        style={{
          marginTop: 24, padding: 0,
          width: 220, height: 220, borderRadius: '50%',
          background: '#BBEAF2', border: '6px solid #0f172a',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, cursor: 'pointer',
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        }}
        aria-label={L ? `Reprendre comme ${profile.name}` : `Resume as ${profile.name}`}
      >
        <span style={{ fontSize: 72, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{initial}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{profile.name}</span>
      </button>

      <button
        onClick={onSwitchProfile}
        style={{
          marginTop: 32, background: 'transparent', border: 'none',
          color: '#475569', fontSize: 15, fontWeight: 600,
          textDecoration: 'underline', cursor: 'pointer',
          maxWidth: 480, textAlign: 'center', padding: '8px 16px',
        }}
      >
        {L
          ? `Pas ${profile.name} ? Ouvre ton propre profil pour ne pas perdre ta progression →`
          : `Not ${profile.name}? Open your own profile so you don't lose your progress →`}
      </button>
    </div>
  );
}
