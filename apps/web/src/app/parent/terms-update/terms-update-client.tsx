'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * Client half of the blocking re-consent screen: explains the T&C changed,
 * links out to read them, and a single primary "J'accepte" action that POSTs
 * `/api/auth/accept-terms` (records a fresh ConsentRecord server-side) then
 * sends the parent back to `/parent` — where the layout gate now passes.
 */
export function TermsUpdateClient({ lang }: { lang: 'fr' | 'en' }) {
  const router = useRouter();
  const L = lang === 'fr';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/accept-terms', { method: 'POST' });
      if (!res.ok) {
        setError(
          L
            ? "Impossible d'enregistrer votre acceptation. Réessayez."
            : "Couldn't record your acceptance. Please try again.",
        );
        setBusy(false);
        return;
      }
      // Full navigation (not just router.push) so the parent layout re-runs
      // its server-side consent check with a fresh request.
      router.push('/parent');
      router.refresh();
    } catch {
      setError(L ? 'Erreur réseau. Réessayez.' : 'Network error. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="auth-stage">
      <div className="auth-main">
        <div className="auth-form-wrap">
          <div className="auth-form" style={{ textAlign: 'center' }}>
            <h1>{L ? 'Nos conditions ont changé' : 'Our terms have changed'}</h1>
            <p className="sub" style={{ marginTop: 14, lineHeight: 1.5 }}>
              {L
                ? "Nous avons mis à jour nos conditions d'utilisation. Merci de les relire, puis de les accepter pour continuer à utiliser votre espace parent."
                : 'We updated our terms of service. Please read them, then accept to keep using your parent space.'}
            </p>
            <div style={{ marginTop: 18 }}>
              <Link href={`/${lang}/terms`} target="_blank" className="btn link" style={{ display: 'inline' }}>
                {L ? "Lire les conditions d'utilisation" : 'Read the terms of service'}
              </Link>
            </div>

            {error && (
              <div className="inline-error" style={{ marginTop: 18 }} role="alert">
                <span>{error}</span>
              </div>
            )}

            <div style={{ marginTop: 28 }}>
              <button
                type="button"
                className="btn mint block lg"
                onClick={accept}
                disabled={busy}
              >
                {busy ? '…' : L ? "J'accepte" : 'I accept'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
