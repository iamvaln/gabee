'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Language } from '@gabee/types';
import { AuthAside, AuthLangToggle } from '../_components/auth-aside';

/**
 * Client island for /parent/reset-password. Initial language comes from the
 * server component (cookie-driven) so SSR + first client render agree —
 * reading `document.cookie` in useState was a server/client branch and
 * tripped Next 16's hydration mismatch check.
 *
 * Three render states share the same AuthAside shell:
 *   - no token in the URL          → "Invalid link"
 *   - token + form not yet submitted → "New password" form
 *   - reset completed              → "Password reset" confirmation
 */
export function ResetPasswordForm({ initialLang }: { initialLang: Language }) {
  return (
    <Suspense fallback={<div className="auth-stage" />}>
      <ResetPasswordInner initialLang={initialLang} />
    </Suspense>
  );
}

function ResetPasswordInner({ initialLang }: { initialLang: Language }) {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const [lang, setLang] = useState<Language>(initialLang);
  const L = lang === 'fr';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function setLangCookie(l: Language) {
    document.cookie = `parent_lang=${l}; path=/; max-age=31536000`;
    setLang(l);
  }

  const passwordOk =
    password.length >= 8 && /\d/.test(password) && /[a-zA-Z]/.test(password);
  const match = password.length > 0 && password === confirm;
  const canSubmit = !!token && passwordOk && match;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? (L ? 'Échec de la réinitialisation.' : 'Reset failed.'));
      }
    } catch {
      setError(L ? 'Erreur réseau.' : 'Network error.');
    }
    setBusy(false);
  }

  return (
    <div className="auth-stage">
      <AuthAside lang={lang} expression="idle" />
      <div className="auth-main">
        <div className="auth-main-top">
          <div className="spacer" />
          <AuthLangToggle lang={lang} setLang={setLangCookie} />
        </div>
        <div className="auth-form-wrap">
          {!token ? (
            <div className="auth-form" style={{ textAlign: 'center' }}>
              <h1>{L ? 'Lien invalide' : 'Invalid link'}</h1>
              <p className="sub" style={{ marginTop: 14 }}>
                {L
                  ? 'Ce lien ne contient pas de jeton valide. Demandez un nouveau lien.'
                  : "This link doesn't contain a valid token. Request a new one."}
              </p>
              <div style={{ marginTop: 28 }}>
                <Link href="/parent/forgot-password" className="btn mint">
                  {L ? 'Demander un nouveau lien' : 'Request a new link'}
                </Link>
              </div>
            </div>
          ) : done ? (
            <div className="auth-form" style={{ textAlign: 'center' }}>
              <h1>{L ? 'Mot de passe réinitialisé' : 'Password reset'}</h1>
              <p className="sub" style={{ marginTop: 14 }}>
                {L
                  ? 'Connectez-vous avec votre nouveau mot de passe.'
                  : 'Sign in with your new password.'}
              </p>
              <div style={{ marginTop: 28 }}>
                <Link href="/parent/login" className="btn mint">
                  {L ? 'Se connecter' : 'Sign in'}
                </Link>
              </div>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              <h1>{L ? 'Nouveau mot de passe' : 'New password'}</h1>
              <p className="sub">
                {L
                  ? 'Choisissez un nouveau mot de passe sécurisé.'
                  : 'Pick a fresh secure password.'}
              </p>
              <div className="field">
                <label htmlFor="rp1">{L ? 'Mot de passe' : 'Password'}</label>
                <input
                  id="rp1"
                  className="input"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <span className="hint">
                  {L ? '8 caractères min., 1 chiffre, 1 lettre' : '8+ chars, 1 digit, 1 letter'}
                </span>
              </div>
              <div className="field">
                <label htmlFor="rp2">{L ? 'Confirmer' : 'Confirm'}</label>
                <input
                  id="rp2"
                  className={'input' + (confirm && !match ? ' bad' : '')}
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={!!confirm && !match}
                />
                {confirm && !match && (
                  <span className="hint" style={{ color: 'var(--bad)' }}>
                    {L ? 'Les mots de passe ne correspondent pas.' : 'Passwords do not match.'}
                  </span>
                )}
              </div>
              {error && (
                <div className="inline-error" role="alert" style={{ marginBottom: 14 }}>
                  {error}
                </div>
              )}
              <button type="submit" className="btn mint block lg" disabled={!canSubmit || busy}>
                {busy ? '…' : L ? 'Réinitialiser' : 'Reset password'}
              </button>
              <div className="auth-foot">
                <Link href="/parent/login">{L ? '← Retour à la connexion' : '← Back to sign in'}</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
