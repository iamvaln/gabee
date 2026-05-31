'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Language } from '@gabee/types';
import { MintBee, MintBeeGlyph } from '../_components/mint-bee';

/**
 * Parent sign-in surface. Verbatim port of the `Login` screen in
 * `parent-onboarding.jsx` (P11) — the same `.auth-stage` 2-column grid with
 * the warm-coral `.auth-aside` on the left and the form `.auth-main` on the
 * right. The aside renders the design's `<AuthAside>`: `.aa-mark` wordmark,
 * 3 bullet `.aa-points` (Classify / Kids / Co-parent), heading + sub, and
 * the mascot in `.aa-bee`. Per brief the tagline is
 * « Restez proche de leur apprentissage. » / "Stay close to their learning."
 * with MintBee `focus`.
 *
 * Existing wiring is preserved: posts `{email, password}` to
 * `/api/auth/login`, then routes by role — admin/super_admin → `/admin`,
 * parent → `next ?? /parent`. The `parent_lang` cookie is written on the
 * FR/EN toggle so the rest of the surface picks it up.
 */
export function LoginForm({ lang: initialLang, next }: { lang: Language; next?: string }) {
  const router = useRouter();
  const [lang, setLang] = useState<Language>(initialLang);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const L = lang === 'fr';

  function setLangCookie(l: Language) {
    document.cookie = `parent_lang=${l}; path=/; max-age=31536000`;
    setLang(l);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as {
        parent?: { role?: string };
      } | null;
      const role = body?.parent?.role;
      const isAdmin = role === 'admin' || role === 'super_admin';
      const fallback = isAdmin ? '/admin' : '/parent';
      router.push(next ?? fallback);
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error?.message ?? (L ? 'Email ou mot de passe incorrect.' : 'Wrong email or password.'));
    setBusy(false);
  }

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 1;

  return (
    <div className="auth-stage">
      <AuthAside lang={lang} />
      <div className="auth-main">
        <div className="auth-main-top">
          <div className="spacer" />
          <AuthLangToggle lang={lang} setLang={setLangCookie} />
        </div>
        <div className="auth-form-wrap">
          <form className="auth-form" onSubmit={onSubmit}>
            <h1>{L ? 'Content de vous revoir' : 'Welcome back'}</h1>
            <p className="sub">{L ? 'Connectez-vous à votre espace parent.' : 'Sign in to your parent space.'}</p>

            {error && (
              <div className="inline-error" style={{ marginBottom: 18 }} role="alert">
                <AlertIcon />
                {error}
              </div>
            )}

            <div className="field">
              <label htmlFor="pe">{L ? 'Email' : 'Email'}</label>
              <input
                id="pe"
                className={'input' + (error ? ' bad' : '')}
                type="email"
                required
                autoComplete="username"
                placeholder={L ? 'email@exemple.com' : 'email@example.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="pp">{L ? 'Mot de passe' : 'Password'}</label>
              <input
                id="pp"
                className={'input' + (error ? ' bad' : '')}
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)' }}>
                {L ? 'Restez connecté en sécurité.' : "Stay signed in securely."}
              </span>
              <Link
                href="/parent/forgot-password"
                className="btn link"
                style={{ marginLeft: 'auto' }}
              >
                {L ? 'Mot de passe oublié ?' : 'Forgot password?'}
              </Link>
            </div>

            <button
              type="submit"
              className="btn mint block lg"
              disabled={!valid || busy}
            >
              {busy ? '…' : (L ? 'Se connecter' : 'Log in')}
            </button>

            <div className="auth-foot">
              {L ? 'Pas encore de compte ? ' : 'No account yet? '}
              <Link href="/parent/signup" className="btn link" style={{ display: 'inline' }}>
                {L ? 'Créer un compte' : 'Sign up'}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Shared aside (mirrors `<AuthAside>` in parent-onboarding.jsx) ──────────
function AuthAside({ lang }: { lang: Language }) {
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
        {/* Non-breaking spaces ( ) inside the guillemets keep the
            closing » from orphaning to its own line when the column wraps —
            French typography convention; stays prettier than swapping to
            straight quotes which would clash with the brand voice. */}
        {L
          ? '« Restez proche de leur apprentissage. »'
          : 'Stay close to their learning.'}
      </h2>
      <p>{L ? "L'espace parent de Gabee." : 'The Gabee parent space.'}</p>
      <div className="aa-bee">
        <MintBee size={150} expression="focus" wings bob />
      </div>
    </aside>
  );
}

// ── Shared lang toggle (mirrors `<AuthLangToggle>` in parent-onboarding.jsx) ──
function AuthLangToggle({ lang, setLang }: { lang: Language; setLang: (l: Language) => void }) {
  return (
    <div className="lang-toggle" role="group" aria-label="language">
      <button type="button" className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
      <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}

// ── Inline alert icon (used by `.inline-error`) ────────────────────────────
function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 22 20H2Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
  );
}

// ── Aside bullet icons (3 of them: classify / kids / users) ───────────────
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
