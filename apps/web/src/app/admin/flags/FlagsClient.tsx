'use client';

import { useState } from 'react';
import type { AdminFlagRow, FlagOverrideRow, Language } from '@gabee/types';

export function FlagsClient({
  initial,
  canEdit,
  lang,
}: {
  initial: AdminFlagRow[];
  canEdit: boolean;
  lang: Language;
}) {
  const L = lang === 'fr';
  const [flags, setFlags] = useState<AdminFlagRow[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleDefault(row: AdminFlagRow) {
    if (!canEdit) return;
    setBusy(row.key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/flags/${row.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_default: !row.enabled_default }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setFlags((fs) => fs.map((f) => (f.key === row.key ? { ...f, enabled_default: !f.enabled_default } : f)));
    } catch {
      setError(L ? 'Échec de la mise à jour.' : 'Update failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card-grid">
      {error && <div className="alert error" role="alert">{error}</div>}
      {flags.map((f) => (
        <FlagCard
          key={f.key}
          row={f}
          canEdit={canEdit}
          busy={busy === f.key}
          lang={lang}
          onToggle={() => toggleDefault(f)}
          onOverrideCountChange={(n) =>
            setFlags((fs) => fs.map((x) => (x.key === f.key ? { ...x, override_count: n } : x)))
          }
        />
      ))}
    </div>
  );
}

function FlagCard({
  row,
  canEdit,
  busy,
  lang,
  onToggle,
  onOverrideCountChange,
}: {
  row: AdminFlagRow;
  canEdit: boolean;
  busy: boolean;
  lang: Language;
  onToggle: () => void;
  onOverrideCountChange: (n: number) => void;
}) {
  const L = lang === 'fr';
  const [open, setOpen] = useState(false);
  const [overrides, setOverrides] = useState<FlagOverrideRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);

  async function loadOverrides() {
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/flags/${row.key}/overrides`);
      if (!res.ok) throw new Error();
      const body = await res.json();
      setOverrides(body.overrides);
      onOverrideCountChange(body.overrides.length);
    } catch {
      setRowError(L ? 'Chargement impossible.' : 'Could not load overrides.');
    }
  }

  async function expand() {
    const next = !open;
    setOpen(next);
    if (next && overrides === null) await loadOverrides();
  }

  async function addOverride() {
    setRowBusy(true);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/flags/${row.key}/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), enabled }),
      });
      if (res.status === 404) throw new Error('unknown');
      if (!res.ok) throw new Error('fail');
      setEmail('');
      await loadOverrides();
    } catch (e) {
      setRowError(
        (e as Error).message === 'unknown'
          ? L ? "Aucun compte avec cet e-mail." : 'No account with that email.'
          : L ? 'Échec.' : 'Failed.',
      );
    } finally {
      setRowBusy(false);
    }
  }

  async function removeOverride(target: string) {
    setRowBusy(true);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/flags/${row.key}/overrides`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      if (!res.ok) throw new Error();
      await loadOverrides();
    } catch {
      setRowError(L ? 'Échec.' : 'Failed.');
    } finally {
      setRowBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontFamily: 'monospace' }}>{row.key}</strong>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>{row.description}</div>
        </div>
        <button
          type="button"
          className={'btn' + (row.enabled_default ? ' on' : '')}
          onClick={onToggle}
          disabled={!canEdit || busy}
          aria-pressed={row.enabled_default}
        >
          {row.enabled_default ? (L ? 'Activé par défaut' : 'On by default') : (L ? 'Coupé par défaut' : 'Off by default')}
        </button>
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="btn ghost" onClick={expand} aria-expanded={open}>
          {L ? 'Exceptions' : 'Overrides'} ({row.override_count})
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
          {rowError && <div className="alert error" role="alert" style={{ marginBottom: 8 }}>{rowError}</div>}
          {overrides === null ? (
            <div style={{ opacity: 0.6, fontSize: 13 }}>…</div>
          ) : overrides.length === 0 ? (
            <div style={{ opacity: 0.6, fontSize: 13 }}>{L ? 'Aucune exception.' : 'No overrides.'}</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {overrides.map((o) => (
                <li key={o.parent_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.email}</span>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>{o.enabled ? (L ? 'activé' : 'on') : (L ? 'coupé' : 'off')}</span>
                  {canEdit && (
                    <button type="button" className="btn ghost sm" onClick={() => removeOverride(o.email)} disabled={rowBusy}>
                      {L ? 'Retirer' : 'Remove'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="email"
                placeholder={L ? 'e-mail du parent' : 'parent email'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button type="button" className="btn ghost sm" onClick={() => setEnabled((v) => !v)} aria-pressed={enabled}>
                {enabled ? (L ? 'activé' : 'on') : (L ? 'coupé' : 'off')}
              </button>
              <button type="button" className="btn sm" onClick={addOverride} disabled={rowBusy || !email.trim()}>
                {L ? 'Ajouter' : 'Add'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
