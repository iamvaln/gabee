'use client';

import { useState } from 'react';
import type { SettingsAccount, SettingsLang } from './settings-tabs';

// Parent spec §10.1 — Profile (ST1). Mirrors `ProfileSettings` from
// docs/.../parent-settings.jsx: .card > .card-head + .card-pad with
// .input-row pairs and .field/.input/.hint atoms.
// Only `display_name_for_kids` actually persists in Phase 1; first_name,
// last_name, country and ui_language are rendered disabled with a "DB
// pending" hint (TODO Phase 2.x: add columns on ParentAccount).
export function ProfileTab({
  lang,
  account,
  onAccountChange,
}: {
  lang: SettingsLang;
  account: SettingsAccount;
  onAccountChange: (next: SettingsAccount) => void;
}) {
  const L = lang === 'fr';
  const [displayName, setDisplayName] = useState(account.displayNameForKids);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = displayName !== account.displayNameForKids;
  const valid = displayName.trim().length >= 1 && displayName.length <= 50;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ display_name_for_kids: displayName }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(
          body?.error?.message ?? (L ? 'Échec de l’enregistrement' : 'Save failed'),
        );
      }
      onAccountChange({ ...account, displayNameForKids: displayName });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDisplayName(account.displayNameForKids);
    setError(null);
  }

  const dbPending = L
    ? 'Bientôt — la colonne base n’est pas encore en place.'
    : 'Coming soon — the DB column is not yet in place.';

  return (
    <div className="card">
      <div className="card-head">
        <h3>{L ? 'Profil' : 'Profile'}</h3>
      </div>
      <div className="card-pad">
        <div className="input-row">
          <div className="field">
            <label>{L ? 'Prénom' : 'First name'}</label>
            <input className="input" disabled placeholder="—" />
            <span className="hint">{dbPending}</span>
          </div>
          <div className="field">
            <label>{L ? 'Nom' : 'Last name'}</label>
            <input className="input" disabled placeholder="—" />
            <span className="hint">{dbPending}</span>
          </div>
        </div>

        <div className="field">
          <label>{L ? 'Email' : 'Email'}</label>
          <input className="input" value={account.email} readOnly />
          <span className="hint">
            {L
              ? 'Le changement d’email arrive bientôt (re-vérification requise).'
              : 'Email change is coming soon (re-verification required).'}
          </span>
        </div>

        <div className="field">
          <label>
            {L ? 'Nom affiché aux enfants' : 'Name shown to your kids'}
          </label>
          <input
            className="input"
            value={displayName}
            maxLength={50}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <span className="hint">
            {L
              ? 'C’est ainsi que vos enfants vous voient dans leurs messages (ex. « Maman », « Papa »).'
              : 'This is how your kids see you in their messages (e.g. "Mom", "Dad").'}
          </span>
        </div>

        <div className="input-row">
          <div className="field">
            <label>{L ? 'Pays' : 'Country'}</label>
            <select className="select" disabled>
              <option>—</option>
            </select>
            <span className="hint">{dbPending}</span>
          </div>
          <div className="field">
            <label>{L ? 'Langue de l’interface' : 'UI language'}</label>
            <select className="select" disabled>
              <option>—</option>
            </select>
            <span className="hint">{dbPending}</span>
          </div>
        </div>

        {error && (
          <div className="inline-error" role="alert" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}
        {savedAt && !dirty && !error && (
          <div
            role="status"
            style={{
              color: 'var(--mint-deep)',
              fontWeight: 800,
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            {L ? 'Enregistré.' : 'Saved.'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <button
            type="button"
            className="btn mint"
            disabled={!dirty || !valid || saving}
            onClick={save}
          >
            {saving ? (L ? 'Enregistrement…' : 'Saving…') : L ? 'Enregistrer' : 'Save'}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={!dirty || saving}
            onClick={cancel}
          >
            {L ? 'Annuler' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
