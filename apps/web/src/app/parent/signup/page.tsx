'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MintBee, MintBeeGlyph } from '../_components/mint-bee';

/**
 * Parent self-signup (P7, parent spec §12.1). Verbatim port of the `Signup`
 * screen in `parent-onboarding.jsx` to the design class system — same
 * `.auth-stage` / `.auth-aside` / `.auth-main` shell, same `.auth-form-wrap`,
 * `.auth-form`, `.field`, `.input`, `.input-row`, `.check`, `.btn.mint.block.lg`,
 * `.auth-foot` primitives. The aside renders `<AuthAside>` exactly like
 * /parent/login.
 *
 * Fields per brief: first_name, last_name, email, password (≥ 8, ≥ 1 digit,
 * ≥ 1 letter), country, T&C accept (link → `/fr/terms`). The signup API
 * currently accepts only `{email, password}` — the other fields are captured
 * client-side and a TODO marks where they'll be persisted once the API grows
 * in milestone-5.
 */

// ISO-3166 short list used by the country select. France comes first (default,
// product-spec: parent app is FR-first).
const COUNTRIES = [
  { code: 'FR', name: { fr: 'France', en: 'France' } },
  { code: 'BE', name: { fr: 'Belgique', en: 'Belgium' } },
  { code: 'CH', name: { fr: 'Suisse', en: 'Switzerland' } },
  { code: 'CA', name: { fr: 'Canada', en: 'Canada' } },
  { code: 'LU', name: { fr: 'Luxembourg', en: 'Luxembourg' } },
  { code: 'US', name: { fr: 'États-Unis', en: 'United States' } },
  { code: 'GB', name: { fr: 'Royaume-Uni', en: 'United Kingdom' } },
  { code: 'OTHER', name: { fr: 'Autre', en: 'Other' } },
];

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="auth-stage" />}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const router = useRouter();
  // Co-parent invite flow (parent spec §9.2 P4): when the visitor lands here
  // from `/parent/coparent/accept?token=…` with no account yet, the accept
  // page bounces us with `?invite=<token>&email=<email>` so we pre-fill the
  // email + auto-accept after the account is created.
  const search = useSearchParams();
  const inviteToken = search.get('invite');
  const inviteEmail = search.get('email');
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(inviteEmail ?? '');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('FR');
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const L = lang === 'fr';

  function setLangCookie(l: 'fr' | 'en') {
    document.cookie = `parent_lang=${l}; path=/; max-age=31536000`;
    setLang(l);
  }

  // Password rule per parent spec §12.1: ≥ 8 chars, ≥ 1 digit, ≥ 1 letter.
  const passwordOk =
    password.length >= 8 && /\d/.test(password) && /[a-zA-Z]/.test(password);
  const emailOk = /\S+@\S+\.\S+/.test(email);
  const valid =
    firstName.trim().length >= 1 &&
    lastName.trim().length >= 1 &&
    emailOk &&
    passwordOk &&
    !!country &&
    accept;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);

    // TODO(milestone-5): also POST { first_name, last_name, country } once
    // the signup API persists them on the ParentAccount (parent spec §13).
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      // Co-parent flow: auto-accept the invite with the freshly-set session.
      if (inviteToken) {
        try {
          await fetch('/api/family/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: inviteToken }),
          });
        } catch {
          // If accept fails (expired, race, etc.), don't block — the parent
          // can re-open the email link; they're now signed in.
        }
      }
      router.push('/parent');
      router.refresh();
      return;
    }
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    setError(body?.error?.message ?? (L ? 'Inscription échouée.' : 'Sign up failed.'));
    setBusy(false);
  }

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
            <h1>
              {inviteToken
                ? L ? 'Acceptez l’invitation' : 'Accept the invitation'
                : L ? 'Créer votre compte' : 'Create your account'}
            </h1>
            <p className="sub">
              {inviteToken
                ? L
                  ? 'Crée ton compte pour rejoindre la famille — tu verras les mêmes enfants tout de suite.'
                  : 'Create your account to join the family — you’ll see the same kids right away.'
                : L
                  ? 'Gratuit, en deux minutes.'
                  : 'Free, takes two minutes.'}
            </p>
            {inviteToken && (
              <div className="banner mint" style={{ marginBottom: 14 }}>
                {L
                  ? `Invitation reçue pour ${inviteEmail}. L’email est verrouillé.`
                  : `Invite received for ${inviteEmail}. Email is locked.`}
              </div>
            )}

            <div className="input-row">
              <div className="field">
                <label htmlFor="pf">{L ? 'Prénom' : 'First name'}</label>
                <input
                  id="pf"
                  className="input"
                  type="text"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="pl">{L ? 'Nom' : 'Last name'}</label>
                <input
                  id="pl"
                  className="input"
                  type="text"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="pe">{L ? 'Email' : 'Email'}</label>
              <input
                id="pe"
                className="input"
                type="email"
                required
                autoComplete="email"
                placeholder={L ? 'email@exemple.com' : 'email@example.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!!inviteToken}
                aria-readonly={!!inviteToken}
              />
            </div>

            <div className="field">
              <label htmlFor="pp">{L ? 'Mot de passe' : 'Password'}</label>
              <input
                id="pp"
                className="input"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span className="hint">
                {L
                  ? '8 caractères min., 1 chiffre, 1 lettre'
                  : '8+ chars, 1 digit, 1 letter'}
              </span>
            </div>

            <div className="field">
              <label htmlFor="pc">{L ? 'Pays' : 'Country'}</label>
              <select
                id="pc"
                className="select"
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name[lang]}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className={'check' + (accept ? ' on' : '')}
              style={{ marginBottom: 18, textAlign: 'left' }}
              onClick={() => setAccept((v) => !v)}
              aria-pressed={accept}
            >
              <span className="box" aria-hidden>
                {accept && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                )}
              </span>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                {L ? "J'accepte les " : 'I accept the '}
                <Link href="/fr/terms" target="_blank" onClick={(e) => e.stopPropagation()}>
                  {L ? "conditions d'utilisation" : 'terms of service'}
                </Link>
                {L ? ' et la politique de confidentialité.' : ' and privacy policy.'}
              </span>
            </button>

            {error && (
              <div className="inline-error" style={{ marginBottom: 18 }} role="alert">
                <AlertIcon />
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn mint block lg"
              disabled={!valid || busy}
            >
              {busy ? '…' : (L ? 'Créer mon compte' : 'Create account')}
            </button>

            <div className="auth-foot">
              {L ? 'Déjà un compte ? ' : 'Already have an account? '}
              <Link href="/parent/login" className="btn link" style={{ display: 'inline' }}>
                {L ? 'Se connecter' : 'Log in'}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Shared aside (mirrors `<AuthAside>` in parent-onboarding.jsx) ──────────
// Identical to the one in /parent/login — kept local to avoid leaking a
// component into _components/ that only the auth pages consume.
function AuthAside({ lang }: { lang: 'fr' | 'en' }) {
  const L = lang === 'fr';
  const points: { icon: 'classify' | 'kids' | 'users'; fr: string; en: string }[] = [
    { icon: 'classify', fr: 'Classez les sessions en un geste', en: 'Classify sessions in one tap' },
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
        {L
          ? '« Restez proche de leur apprentissage. »'
          : 'Stay close to their learning.'}
      </h2>
      <p>{L ? "L'espace parent de Gabee." : 'The Gabee parent space.'}</p>
      <div className="aa-bee">
        <MintBee size={150} expression="encourage" wings bob />
      </div>
    </aside>
  );
}

function AuthLangToggle({ lang, setLang }: { lang: 'fr' | 'en'; setLang: (l: 'fr' | 'en') => void }) {
  return (
    <div className="lang-toggle" role="group" aria-label="language">
      <button type="button" className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
      <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 22 20H2Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
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
