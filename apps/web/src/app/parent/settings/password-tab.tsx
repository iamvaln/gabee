'use client';

import { useState } from 'react';
import type { SettingsLang } from './settings-tabs';

// Parent spec §10.2 — Password (ST2). Mirrors `PasswordSettings` from
// docs/.../parent-settings.jsx: .card > .card-head + .card-pad with
// .field/.input/.hint atoms and a single .btn.mint submit.
// Client-side strength validation matches the backend Zod schema:
// >= 8 chars, at least one letter and one digit.
export function PasswordTab({ lang }: { lang: SettingsLang }) {
  const L = lang === 'fr';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okAt, setOkAt] = useState<number | null>(null);

  const strong = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);
  const matches = confirm.length > 0 && confirm === next;
  const canSubmit = !!current && strong && matches && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    setOkAt(null);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.status === 204) {
        setOkAt(Date.now());
        setCurrent('');
        setNext('');
        setConfirm('');
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string; code?: string } }
        | null;
      if (body?.error?.code === 'invalid_credentials') {
        throw new Error(
          L ? 'Mot de passe actuel incorrect.' : 'Current password is incorrect.',
        );
      }
      throw new Error(
        body?.error?.message ?? (L ? 'Échec du changement.' : 'Change failed.'),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{L ? 'Mot de passe' : 'Password'}</h3>
      </div>
      <div className="card-pad">
        <div className="field">
          <label>{L ? 'Mot de passe actuel' : 'Current password'}</label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShow((s) => !s)}
              aria-label={
                show
                  ? L
                    ? 'Masquer le mot de passe'
                    : 'Hide password'
                  : L
                    ? 'Afficher le mot de passe'
                    : 'Show password'
              }
              style={{
                position: 'absolute',
                right: 4,
                top: 4,
                width: 36,
                height: 36,
                border: 0,
                background: 'transparent',
              }}
            >
              {show ? (
                <svg
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M3 3l18 18" />
                  <path d="M10.5 6.3A9 9 0 0 1 12 6c5 0 9 6 9 6a14 14 0 0 1-3.2 3.7" />
                  <path d="M6.4 6.4A14 14 0 0 0 3 12s4 6 9 6a8.5 8.5 0 0 0 3.6-.8" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              ) : (
                <svg
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="field">
          <label>{L ? 'Nouveau mot de passe' : 'New password'}</label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <span className="hint">
            {L
              ? 'Au moins 8 caractères, 1 chiffre et 1 lettre.'
              : 'At least 8 characters, 1 digit and 1 letter.'}
          </span>
        </div>

        <div className="field">
          <label>{L ? 'Confirmer' : 'Confirm'}</label>
          <input
            className={'input' + (confirm.length > 0 && !matches ? ' bad' : '')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {confirm.length > 0 && !matches && (
            <span className="err">
              {L
                ? 'Les mots de passe ne correspondent pas.'
                : 'Passwords do not match.'}
            </span>
          )}
        </div>

        {error && (
          <div
            className="inline-error"
            role="alert"
            style={{ marginBottom: 14 }}
          >
            {error}
          </div>
        )}
        {okAt && (
          <div className="banner mint" role="status">
            <span style={{ fontWeight: 800 }}>
              {L ? 'Mot de passe changé.' : 'Password changed.'}
            </span>
          </div>
        )}

        <button
          type="button"
          className="btn mint"
          disabled={!canSubmit}
          onClick={submit}
        >
          {busy
            ? L
              ? 'Changement…'
              : 'Changing…'
            : L
              ? 'Changer le mot de passe'
              : 'Change password'}
        </button>
      </div>
    </div>
  );
}
