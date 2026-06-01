'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Language } from '@gabee/types';
import { AuthAside, AuthLangToggle } from '../_components/auth-aside';

/**
 * Parent sign-in surface. Verbatim port of the `Login` screen in
 * `parent-onboarding.jsx` (P11) — the same `.auth-stage` 2-column grid with
 * the warm-coral `.auth-aside` on the left and the form `.auth-main` on the
 * right. The aside renders the design's `<AuthAside>`: `.aa-mark` wordmark,
 * 3 bullet `.aa-points` (Classify / Kids / Co-parent), heading + sub, and
 * the mascot in `.aa-bee`. Per brief the tagline is
 * "Restez proche de leur apprentissage." / "Stay close to their learning."
 * with MintBee `focus`.
 *
 * Existing wiring is preserved: posts `{email, password}` to
 * `/api/auth/login`, then routes by role — admin/super_admin → `/admin`,
 * parent → `next ?? /parent`. The `parent_lang` cookie is written on the
 * FR/EN toggle so the rest of the surface picks it up.
 */
export function LoginForm({
  lang: initialLang,
  next,
  initialEmail,
}: {
  lang: Language;
  next?: string;
  /** Pre-fill when landing here from `/parent/signup?email=…` after the user
   *  hit the "account already exists" CTA — saves them retyping. */
  initialEmail?: string;
}) {
  const router = useRouter();
  const [lang, setLang] = useState<Language>(initialLang);
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Set when login is refused because the email isn't confirmed yet — unlocks
  // a "resend confirmation" action below the error.
  const [notConfirmed, setNotConfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  const L = lang === 'fr';

  async function resendConfirmation() {
    try {
      await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Always-200 endpoint; ignore network blips.
    }
    setResent(true);
  }

  function setLangCookie(l: Language) {
    document.cookie = `parent_lang=${l}; path=/; max-age=31536000`;
    setLang(l);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotConfirmed(false);
    setResent(false);
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
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    if (body?.error?.code === 'email_not_confirmed') {
      setNotConfirmed(true);
      setError(
        L
          ? "Confirme ton email avant de te connecter — vérifie ta boîte mail."
          : 'Confirm your email before signing in — check your inbox.',
      );
    } else {
      setError(body?.error?.message ?? (L ? 'Email ou mot de passe incorrect.' : 'Wrong email or password.'));
    }
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
                <span>
                  {error}
                  {notConfirmed && (
                    <>
                      {' '}
                      {resent ? (
                        <strong>{L ? 'Lien renvoyé ✓' : 'Link resent ✓'}</strong>
                      ) : (
                        <button
                          type="button"
                          onClick={resendConfirmation}
                          style={{ fontWeight: 800, textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', color: 'inherit', padding: 0 }}
                        >
                          {L ? 'Renvoyer le lien' : 'Resend the link'}
                        </button>
                      )}
                    </>
                  )}
                </span>
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

// ── Inline alert icon (used by `.inline-error`) ────────────────────────────
function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 22 20H2Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
  );
}


