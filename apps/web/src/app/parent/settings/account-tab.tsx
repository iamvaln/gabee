'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SettingsAccount, SettingsLang } from './settings-tabs';

// Parent spec §10.6 (ST5) — Account: Sign out + destructive delete. The
// delete section mirrors `DeleteAccount` from docs/.../parent-settings.jsx:
// .card with red-tinted border, type-your-email confirmation, .btn.danger.
// Deletion enqueues GdprRequest(kind=erase); admin executes the actual purge
// per admin spec §9. After submit we redirect to /parent/login.
export function AccountTab({
  lang,
  account,
}: {
  lang: SettingsLang;
  account: SettingsAccount;
}) {
  const L = lang === 'fr';
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/parent/login');
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>{L ? 'Session' : 'Sign out'}</h3>
        </div>
        <div className="card-pad">
          <p
            style={{
              margin: '0 0 14px',
              color: 'var(--text-2)',
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.55,
            }}
          >
            {L
              ? 'Vous serez déconnecté·e sur cet appareil. Les appareils enfants restent connectés.'
              : 'You will be signed out on this device. Kid devices stay paired.'}
          </p>
          <button
            type="button"
            className="btn mint-outline"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut
              ? L
                ? 'Déconnexion…'
                : 'Signing out…'
              : L
                ? 'Se déconnecter'
                : 'Sign out'}
          </button>
        </div>
      </div>

      <DeleteSection lang={lang} account={account} />
    </>
  );
}

// Mirrors `DeleteAccount` in handoff parent-settings.jsx verbatim: the card
// border + heading take the destructive tone via inline color hooks into the
// `--bad`/`--bad-bg` tokens (the canonical CSS does not ship a `.card.danger`
// or `.banner.bad` variant — the handoff itself uses the same inline style).
function DeleteSection({
  lang,
  account,
}: {
  lang: SettingsLang;
  account: SettingsAccount;
}) {
  const L = lang === 'fr';
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === account.email.toLowerCase();
  const canSubmit = matches && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email_confirm: typed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? (L ? 'Échec.' : 'Failed.'));
      }
      router.push('/parent/login');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ borderColor: 'var(--bad-bg)' }}>
      <div className="card-head" style={{ borderColor: 'var(--bad-bg)' }}>
        <h3 style={{ color: 'var(--bad)' }}>
          {L ? 'Supprimer le compte' : 'Delete account'}
        </h3>
      </div>
      <div className="card-pad">
        <p
          style={{
            marginTop: 0,
            fontWeight: 600,
            color: 'var(--text-2)',
            lineHeight: 1.6,
          }}
        >
          {L
            ? 'Cette action est irréversible. Les profils enfants, sessions et retours liés seront supprimés. Un email de confirmation vous sera envoyé après traitement par notre équipe.'
            : 'This is irreversible. Linked kid profiles, sessions and feedback will be deleted. A confirmation email will be sent after our team processes it.'}
        </p>
        <div className="field" style={{ maxWidth: 380 }}>
          <label>
            {L ? 'Tapez votre email pour confirmer' : 'Type your email to confirm'}
          </label>
          <input
            className={'input' + (typed && !matches ? ' bad' : '')}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={account.email}
          />
        </div>
        {error && (
          <div className="inline-error" role="alert" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}
        <button
          type="button"
          className="btn danger"
          onClick={submit}
          disabled={!canSubmit}
          style={
            canSubmit
              ? {
                  background: 'var(--bad)',
                  color: '#fff',
                  borderColor: 'var(--bad)',
                }
              : undefined
          }
        >
          {busy
            ? L
              ? 'Envoi…'
              : 'Submitting…'
            : L
              ? 'Supprimer mon compte'
              : 'Delete my account'}
        </button>
      </div>
    </div>
  );
}
