import { useTranslation } from 'react-i18next';
import type { Language } from '@gabee/types';

// Bottom navigation — Duolingo-style three-tab bar pinned to the bottom of
// the kid frame. Visible on the three "browse" tabs (Apprendre / Carte /
// Coffre); App.tsx hides it during sessions, summary screens, lock/look-
// away overlays, and the daily-cap lock screen so play stays full-screen.
//
// Icons are SVG (kid app already ships its own minimal icon set) so they
// stay crisp on retina and never lag behind an emoji-font update.

export type KidTab = 'apprendre' | 'carte' | 'coffre';

const LABEL: Record<KidTab, { fr: string; en: string }> = {
  apprendre: { fr: 'Apprendre', en: 'Learn' },
  carte: { fr: 'Carte', en: 'Map' },
  coffre: { fr: 'Coffre', en: 'Chest' },
};

export function BottomNav({
  tab,
  onChange,
  lang,
}: {
  tab: KidTab;
  onChange: (next: KidTab) => void;
  lang: Language;
}) {
  const { t } = useTranslation();
  return (
    <nav
      className="kid-bottom-nav"
      aria-label={t('nav.main')}
      style={navStyle}
    >
      <NavBtn active={tab === 'apprendre'} onClick={() => onChange('apprendre')} label={LABEL.apprendre[lang]}>
        <PadIcon />
      </NavBtn>
      <NavBtn active={tab === 'carte'} onClick={() => onChange('carte')} label={LABEL.carte[lang]}>
        <MapIcon />
      </NavBtn>
      <NavBtn active={tab === 'coffre'} onClick={() => onChange('coffre')} label={LABEL.coffre[lang]}>
        <ChestIcon />
      </NavBtn>
    </nav>
  );
}

function NavBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      style={{ ...btnStyle, color: active ? 'var(--color-brand, #FACC15)' : '#475569' }}
    >
      <span style={iconWrap}>{children}</span>
      <span style={{ ...labelStyle, fontWeight: active ? 800 : 600 }}>{label}</span>
    </button>
  );
}

const navStyle: React.CSSProperties = {
  position: 'sticky',
  bottom: 0,
  left: 0,
  right: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  background: 'white',
  borderTop: '1px solid #E2E8F0',
  paddingTop: 6,
  paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))',
  zIndex: 50,
};

const btnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: '6px 4px',
  background: 'transparent',
  border: 0,
  cursor: 'pointer',
};

const iconWrap: React.CSSProperties = {
  display: 'inline-flex',
  width: 28,
  height: 28,
  alignItems: 'center',
  justifyContent: 'center',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 0.2,
};

function PadIcon() {
  // Game-pad — "Apprendre" is the play tab.
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="7" width="20" height="11" rx="5" />
      <line x1="7" y1="11" x2="7" y2="14" /><line x1="5.5" y1="12.5" x2="8.5" y2="12.5" />
      <circle cx="16" cy="11.5" r="0.8" fill="currentColor" /><circle cx="17.5" cy="13.5" r="0.8" fill="currentColor" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <line x1="9" y1="4" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="20" />
    </svg>
  );
}
function ChestIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="9" width="18" height="11" rx="2" />
      <path d="M3 13h18" /><path d="M3 9c0-3.3 2.7-5 9-5s9 1.7 9 5" />
      <rect x="10.5" y="12" width="3" height="3" rx="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
