'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

/**
 * /parent/reset-password?token=… — final step of the reset flow.
 *
 * UX:
 *   - Reads the token from the query string (sent in the email).
 *   - Asks for new password + repeat password. Same rule as signup: 8 chars,
 *     1 digit, 1 letter, MUST match the repeat field.
 *   - POSTs to /api/auth/reset-password; on success offers a CTA to log in.
 *   - On 400 (expired/invalid) or 409 (already used) shows the API error
 *     verbatim — those are user-visible cases we WANT to be clear about.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-stage" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const lang = typeof document !== 'undefined' && document.cookie.includes('parent_lang=en') ? 'en' : 'fr';
  const L = lang === 'fr';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? (L ? 'Échec de la réinitialisation.' : 'Reset failed.'));
      }
    } catch {
      setError(L ? 'Erreur réseau.' : 'Network error.');
    }
    setBusy(false);
  }

  if (!token) {
    return (
      <div className="auth-stage">
        <div className="auth-main">
          <div className="auth-form-wrap">
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
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-stage">
        <div className="auth-main">
          <div className="auth-form-wrap">
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-stage">
      <div className="auth-main">
        <div className="auth-form-wrap">
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
        </div>
      </div>
    </div>
  );
}
