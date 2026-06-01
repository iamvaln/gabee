'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Language } from '@gabee/types';
import { AuthAside, AuthLangToggle } from '../_components/auth-aside';

/**
 * Client island for /parent/forgot-password. Receives the initial language
 * from the parent server component (which reads the `parent_lang` cookie)
 * so SSR + hydration agree — reading `document.cookie` from useState was a
 * server/client branch and tripped Next 16's hydration mismatch check.
 */
export function ForgotPasswordForm({ initialLang }: { initialLang: Language }) {
  const [lang, setLang] = useState<Language>(initialLang);
  const L = lang === 'fr';
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function setLangCookie(l: Language) {
    document.cookie = `parent_lang=${l}; path=/; max-age=31536000`;
    setLang(l);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Even on network error, show the success screen — the user will
      // either find the email or retry. Hiding network details defeats
      // enumeration by timing.
    }
    setSubmitted(true);
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
          {submitted ? (
            <div className="auth-form" style={{ textAlign: 'center' }}>
              <h1>{L ? 'Vérifiez votre boîte mail' : 'Check your inbox'}</h1>
              <p className="sub" style={{ marginTop: 14, lineHeight: 1.5 }}>
                {L
                  ? `Si un compte existe pour ${email}, un lien de réinitialisation y a été envoyé. Il expire dans 30 minutes.`
                  : `If an account exists for ${email}, a reset link has been sent. It expires in 30 minutes.`}
              </p>
              <div style={{ marginTop: 28 }}>
                <Link href="/parent/login" className="btn mint">
                  {L ? 'Retour à la connexion' : 'Back to sign in'}
                </Link>
              </div>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              <h1>{L ? 'Mot de passe oublié' : 'Forgot your password'}</h1>
              <p className="sub">
                {L
                  ? 'Indiquez votre email — on vous envoie un lien pour le réinitialiser.'
                  : "Tell us your email — we'll send a link to reset it."}
              </p>
              <div className="field">
                <label htmlFor="fpe">{L ? 'Email' : 'Email'}</label>
                <input
                  id="fpe"
                  className="input"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button type="submit" className="btn mint block lg" disabled={busy || !email}>
                {busy ? '…' : L ? 'Envoyer le lien' : 'Send the link'}
              </button>
              <div className="auth-foot">
                <Link href="/parent/login">
                  {L ? '← Retour à la connexion' : '← Back to sign in'}
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
