'use client';

import { useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import { AuthAside, AuthLangToggle } from "../_components/auth-aside";

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

// Full ISO-3166 country list, built once at module load:
//   - `libphonenumber-js` gives us every code that has a dialling plan
//     (~240 entries), so the phone picker always shows a valid country.
//   - `Intl.DisplayNames` (built into the JS runtime — no extra dep) localises
//     each name in FR + EN, and the locale-aware sort places accented names
//     in the right alphabetical slot.
//   - Cameroun (CM) is forced to the top of the list — primary market — so a
//     user landing fresh doesn't have to scroll past 30 countries before
//     hitting the right default. The rest is plain alphabetical.
const PRIMARY_CODES: readonly CountryCode[] = ['CM'];

function buildCountryList(lang: 'fr' | 'en') {
  const intl = new Intl.DisplayNames([lang], { type: 'region' });
  const all = getCountries().map((code) => ({
    code,
    name: intl.of(code) ?? code,
  }));
  const primary = PRIMARY_CODES.map(
    (code) => all.find((c) => c.code === code) ?? { code, name: code },
  );
  const primarySet = new Set<CountryCode>(PRIMARY_CODES);
  const rest = all
    .filter((c) => !primarySet.has(c.code))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
  return [...primary, ...rest];
}

const COUNTRIES_FR = buildCountryList('fr');
const COUNTRIES_EN = buildCountryList('en');

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="auth-stage" />}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
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
  const [confirmPassword, setConfirmPassword] = useState('');
  // Phone is REQUIRED on signup (account-recovery support + reachability).
  // Validated client-side via libphonenumber-js; the server re-runs the same
  // check. The country picker doubles as the country-of-residence signal so
  // we don't need a separate `country` state/field.
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('CM');
  const [phoneNational, setPhoneNational] = useState('');
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the account is created: we DON'T sign the user in — they must
  // confirm their email first. Flips the screen to a "check your inbox" state.
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);
  /**
   * Set ONLY when the API returned `email_taken` (409). Lets the inline error
   * render a "Sign in instead" CTA that deeplinks back to /parent/login with
   * the email pre-filled — way nicer than just telling the user they're
   * stuck.
   */
  const [emailTaken, setEmailTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const L = lang === 'fr';

  // E.164 phone or null. Memoised so we don't re-parse on every render — the
  // parser is non-trivial for international numbers.
  const phoneE164 = useMemo<string | null>(() => {
    const raw = phoneNational.trim();
    if (!raw) return null;
    const parsed = parsePhoneNumberFromString(raw, phoneCountry);
    if (!parsed || !parsed.isValid()) return null;
    return parsed.number; // E.164: '+23767512345'
  }, [phoneNational, phoneCountry]);
  // Phone is REQUIRED — empty input is NOT ok now.
  const phoneOk = phoneE164 !== null;
  const passwordMatch = password.length > 0 && password === confirmPassword;

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
    passwordMatch &&
    phoneOk &&
    accept;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !phoneE164) return;
    setBusy(true);
    setError(null);
    setEmailTaken(false);

    // TODO(milestone-5): also POST { first_name, last_name } once the signup
    // API persists them on the ParentAccount (parent spec §13). Country is
    // inferred from the phone country code at the DB layer when needed.
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        phone: phoneE164,
        terms_accepted: accept,
      }),
    });
    if (res.ok) {
      // No session is issued — the account must confirm its email first. Show
      // the "check your inbox" screen. (Co-parent invitees finish accepting by
      // re-opening their invite link once confirmed + signed in.)
      setSent(true);
      setBusy(false);
      return;
    }
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const code = body?.error?.code;
    if (code === 'email_taken') {
      // Show a friendly French / English message — the API's English string is
      // accurate but generic; we want the localised, conversational tone here.
      setError(
        L
          ? 'Un compte existe déjà avec cet email.'
          : 'An account already exists with this email.',
      );
      setEmailTaken(true);
    } else {
      setError(body?.error?.message ?? (L ? 'Inscription échouée.' : 'Sign up failed.'));
    }
    setBusy(false);
  }

  async function resend() {
    try {
      await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Always-200 endpoint; ignore network blips and just show "sent".
    }
    setResent(true);
  }

  // ── Post-signup: account created, awaiting email confirmation ──────────────
  if (sent) {
    return (
      <div className="auth-stage">
        <AuthAside lang={lang} expression="encourage" />
        <div className="auth-main">
          <div className="auth-main-top">
            <div className="spacer" />
            <AuthLangToggle lang={lang} setLang={setLangCookie} />
          </div>
          <div className="auth-form-wrap">
            <div className="auth-form" style={{ textAlign: 'center' }}>
              <h1>{L ? 'Vérifie tes mails' : 'Check your inbox'}</h1>
              <p className="sub" style={{ marginTop: 14, lineHeight: 1.5 }}>
                {L
                  ? `On a envoyé un lien de confirmation à ${email}. Clique dessus pour activer ton compte, puis connecte-toi.`
                  : `We sent a confirmation link to ${email}. Click it to activate your account, then sign in.`}
              </p>
              <div style={{ marginTop: 28 }}>
                <Link href="/parent/login" className="btn mint block lg">
                  {L ? 'Aller à la connexion' : 'Go to sign in'}
                </Link>
              </div>
              <div className="auth-foot" style={{ marginTop: 18 }}>
                {resent ? (
                  <span style={{ opacity: 0.8 }}>
                    {L ? 'Lien renvoyé ✓' : 'Link resent ✓'}
                  </span>
                ) : (
                  <>
                    {L ? "Pas reçu l'email ? " : "Didn't get the email? "}
                    <button type="button" className="btn link" style={{ display: 'inline' }} onClick={resend}>
                      {L ? 'Renvoyer' : 'Resend'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-stage">
      <AuthAside lang={lang} expression="encourage" />
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
              <label htmlFor="pp2">{L ? 'Confirmer le mot de passe' : 'Confirm password'}</label>
              <input
                id="pp2"
                className={'input' + (confirmPassword && !passwordMatch ? ' bad' : '')}
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-invalid={!!confirmPassword && !passwordMatch}
              />
              {confirmPassword && !passwordMatch && (
                <span className="hint" style={{ color: 'var(--bad)' }}>
                  {L ? 'Les mots de passe ne correspondent pas.' : 'Passwords do not match.'}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="pph">{L ? 'Téléphone' : 'Phone'}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  aria-label={L ? 'Pays' : 'Country'}
                  className="select"
                  value={phoneCountry}
                  onChange={(e) => setPhoneCountry(e.target.value as CountryCode)}
                  style={{ width: 160, flexShrink: 0 }}
                >
                  {(L ? COUNTRIES_FR : COUNTRIES_EN).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} (+{getCountryCallingCode(c.code)})
                    </option>
                  ))}
                </select>
                <input
                  id="pph"
                  className={'input' + (phoneNational && !phoneOk ? ' bad' : '')}
                  type="tel"
                  required
                  autoComplete="tel-national"
                  placeholder="6 75 12 34 56"
                  value={phoneNational}
                  onChange={(e) => setPhoneNational(e.target.value)}
                  aria-invalid={!!phoneNational && !phoneOk}
                />
              </div>
              {phoneNational && !phoneOk && (
                <span className="hint" style={{ color: 'var(--bad)' }}>
                  {L ? 'Numéro de téléphone invalide.' : 'Phone number is not valid.'}
                </span>
              )}
              {!phoneNational && (
                <span className="hint">
                  {L
                    ? 'Pour la récupération de compte si vous perdez votre mot de passe.'
                    : 'For account recovery if you lose your password.'}
                </span>
              )}
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
                <Link href={`/${lang}/terms`} target="_blank" onClick={(e) => e.stopPropagation()}>
                  {L ? "conditions d'utilisation" : 'terms of service'}
                </Link>
                {L ? ' et la ' : ' and '}
                <Link href={`/${lang}/privacy`} target="_blank" onClick={(e) => e.stopPropagation()}>
                  {L ? 'politique de confidentialité' : 'privacy policy'}
                </Link>
                {'.'}
              </span>
            </button>

            {error && (
              <div className="inline-error" style={{ marginBottom: 18 }} role="alert">
                <AlertIcon />
                <span>
                  {error}
                  {emailTaken && (
                    <>
                      {' '}
                      <Link
                        href={`/parent/login?email=${encodeURIComponent(email)}`}
                        style={{ fontWeight: 800, textDecoration: 'underline' }}
                      >
                        {L ? 'Se connecter à la place ?' : 'Sign in instead?'}
                      </Link>
                    </>
                  )}
                </span>
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


function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 22 20H2Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
  );
}

