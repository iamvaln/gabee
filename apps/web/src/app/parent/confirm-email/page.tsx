'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

/**
 * /parent/confirm-email?token=… — opens automatically from the signup email.
 *
 * On mount we POST the token; on success the user sees a confirmation +
 * direct link to the parent home. On expired/already-consumed we show a
 * clear error so the user knows to log in (they may already be in if the
 * link was clicked from another tab).
 */
export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<div className="auth-stage" />}>
      <ConfirmEmailInner />
    </Suspense>
  );
}

function ConfirmEmailInner() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const lang = typeof document !== 'undefined' && document.cookie.includes('parent_lang=en') ? 'en' : 'fr';
  const L = lang === 'fr';
  const [state, setState] = useState<'pending' | 'ok' | 'err'>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('err');
      setErrorMessage(L ? 'Lien invalide.' : 'Invalid link.');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/auth/confirm-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          setState('ok');
        } else {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          setState('err');
          setErrorMessage(
            body?.error?.message ?? (L ? 'Confirmation impossible.' : "Couldn't confirm."),
          );
        }
      } catch {
        setState('err');
        setErrorMessage(L ? 'Erreur réseau.' : 'Network error.');
      }
    })();
  }, [token, L]);

  return (
    <div className="auth-stage">
      <div className="auth-main">
        <div className="auth-form-wrap">
          <div className="auth-form" style={{ textAlign: 'center' }}>
            {state === 'pending' && (
              <>
                <h1>{L ? 'Confirmation en cours…' : 'Confirming…'}</h1>
                <p className="sub" style={{ marginTop: 14 }}>
                  {L ? 'Un instant.' : 'One moment.'}
                </p>
              </>
            )}
            {state === 'ok' && (
              <>
                <h1>{L ? 'Email confirmé !' : 'Email confirmed!'}</h1>
                <p className="sub" style={{ marginTop: 14 }}>
                  {L
                    ? "Votre compte est maintenant pleinement actif."
                    : 'Your account is now fully active.'}
                </p>
                <div style={{ marginTop: 28 }}>
                  <Link href="/parent" className="btn mint">
                    {L ? 'Aller à mon espace parent' : 'Go to my parent space'}
                  </Link>
                </div>
              </>
            )}
            {state === 'err' && (
              <>
                <h1>{L ? 'Confirmation impossible' : "Couldn't confirm"}</h1>
                <p className="sub" style={{ marginTop: 14, color: 'var(--text-2)' }}>
                  {errorMessage}
                </p>
                <div style={{ marginTop: 28 }}>
                  <Link href="/parent/login" className="btn mint">
                    {L ? 'Se connecter' : 'Sign in'}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
