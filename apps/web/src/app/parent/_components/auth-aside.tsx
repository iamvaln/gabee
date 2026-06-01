import type { Language } from '@gabee/types';
import { MintBee, MintBeeGlyph } from './mint-bee';

/**
 * Coral-tinted left-column aside used by every parent auth surface
 * (`/parent/login`, `/parent/signup`, `/parent/forgot-password`,
 * `/parent/reset-password`). Mirrors `<AuthAside>` from the
 * `parent-onboarding.jsx` design.
 *
 * Single source of truth for the bullets, tagline + mascot. Previously each
 * auth page kept its own copy — diverged subtly over time. The `expression`
 * prop lets each page tune the mascot (focus for login, encourage for
 * signup, idle for the recovery flows).
 */

interface AuthAsideProps {
  lang: Language;
  /** Mascot mood — login `focus`, signup `encourage`, recovery flows `idle`. */
  expression?: 'idle' | 'focus' | 'encourage' | 'correct' | 'celebrate';
}

export function AuthAside({ lang, expression = 'focus' }: AuthAsideProps) {
  const L = lang === 'fr';
  const points: { icon: 'classify' | 'kids' | 'users'; fr: string; en: string }[] = [
    { icon: 'classify', fr: 'Revoyez les sessions en un geste', en: 'Review sessions in one tap' },
    { icon: 'kids', fr: 'Suivez chaque enfant en détail', en: 'Follow each kid in detail' },
    { icon: 'users', fr: 'Co-parentez à deux, en confiance', en: 'Co-parent together, in sync' },
  ];
  return (
    <aside className="auth-aside">
      <div className="aa-mark">
        <MintBeeGlyph size={30} />
        <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.03em' }}>abee</span>
      </div>
      <div className="aa-points">
        {points.map((p) => (
          <div className="aa-point" key={p.icon}>
            <span className="ic"><AsideIcon name={p.icon} size={17} /></span>
            {p[lang]}
          </div>
        ))}
      </div>
      <h2>
        {/* Typographic curly double quotes via Unicode escapes
            (U+201C / U+201D). The `.auth-aside h2` max-width is sized so the
            line fits in 2 lines for FR + EN. */}
        {L
          ? '“Restez proche de leur apprentissage.”'
          : '“Stay close to their learning.”'}
      </h2>
      <p>{L ? "L'espace parent de Gabee." : 'The Gabee parent space.'}</p>
      <div className="aa-bee">
        <MintBee size={150} expression={expression} wings bob />
      </div>
    </aside>
  );
}

function AsideIcon({ name, size = 17 }: { name: 'classify' | 'kids' | 'users'; size?: number }) {
  const s = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'classify':
      return (<svg {...s}><path d="M4 6h11" /><path d="M4 12h7" /><path d="M4 18h9" /><path d="m15.5 16.5 2 2 4-4" /></svg>);
    case 'kids':
      return (<svg {...s}><circle cx="8" cy="8" r="3" /><path d="M3 20a5 5 0 0 1 10 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 20a4 4 0 0 1 5.5-3.7" /></svg>);
    case 'users':
      return (<svg {...s}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.4a3 3 0 0 1 0 5.2" /><path d="M17.5 13.4A5.5 5.5 0 0 1 20.5 18.5" /></svg>);
    default:
      return null;
  }
}

/** Compact FR/EN switch shared by every auth page. */
export function AuthLangToggle({
  lang,
  setLang,
}: {
  lang: Language;
  setLang: (l: Language) => void;
}) {
  return (
    <div className="lang-toggle" role="group" aria-label="language">
      <button type="button" className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
      <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}
