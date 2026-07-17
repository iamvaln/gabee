'use client';

import { useEffect, useState } from 'react';
import type { AdminFlagRow, FlagOverrideRow, Language } from '@gabee/types';

type ParentOption = { email: string; children_count: number };

/** Accessible on/off toggle switch (admin.css `.switch`). */
function Switch({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="slider" />
    </label>
  );
}

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
  // Parent accounts to pick from when adding an override — admins select, never type.
  const [parents, setParents] = useState<ParentOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/admin/users/parents')
      .then((r) => (r.ok ? r.json() : { parents: [] }))
      .then((body) => {
        if (cancelled) return;
        setParents(
          (body.parents ?? []).map((p: { email: string; children_count?: number }) => ({
            email: p.email,
            children_count: p.children_count ?? 0,
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleDefault(row: AdminFlagRow, next: boolean) {
    if (!canEdit) return;
    setBusy(row.key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/flags/${row.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_default: next }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setFlags((fs) => fs.map((f) => (f.key === row.key ? { ...f, enabled_default: next } : f)));
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
          parents={parents}
          onToggle={(next) => toggleDefault(f, next)}
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
  parents,
  onToggle,
  onOverrideCountChange,
}: {
  row: AdminFlagRow;
  canEdit: boolean;
  busy: boolean;
  lang: Language;
  parents: ParentOption[];
  onToggle: (next: boolean) => void;
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

  /** PUT an override (add, or flip an existing one's on/off). */
  async function putOverride(targetEmail: string, targetEnabled: boolean) {
    setRowBusy(true);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/flags/${row.key}/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail.trim(), enabled: targetEnabled }),
      });
      if (res.status === 404) throw new Error('unknown');
      if (!res.ok) throw new Error('fail');
      await loadOverrides();
      return true;
    } catch (e) {
      setRowError(
        (e as Error).message === 'unknown'
          ? L ? 'Aucun compte avec cet e-mail.' : 'No account with that email.'
          : L ? 'Échec.' : 'Failed.',
      );
      return false;
    } finally {
      setRowBusy(false);
    }
  }

  async function addOverride() {
    if (await putOverride(email, enabled)) setEmail('');
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontFamily: 'monospace' }}>{row.key}</strong>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>{row.description}</div>
        </div>
        <div className="switch-row">
          <span className="switch-label" style={{ textAlign: 'right' }}>
            {row.enabled_default ? (L ? 'Activé par défaut' : 'On by default') : (L ? 'Coupé par défaut' : 'Off by default')}
          </span>
          <Switch
            checked={row.enabled_default}
            disabled={!canEdit || busy}
            onChange={onToggle}
            ariaLabel={`${row.key} — ${L ? 'valeur par défaut' : 'default'}`}
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={expand} aria-expanded={open}>
          {L ? 'Par compte parent' : 'Per parent account'} ({row.override_count})
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 8 }}>
            {L
              ? "Exceptions au réglage par défaut, ciblées sur un compte parent (toute la famille)."
              : 'Exceptions to the default, targeted at a parent account (the whole family).'}
          </div>
          {rowError && <div className="alert error" role="alert" style={{ marginBottom: 8 }}>{rowError}</div>}
          {overrides === null ? (
            <div style={{ opacity: 0.6, fontSize: 13 }}>…</div>
          ) : overrides.length === 0 ? (
            <div style={{ opacity: 0.6, fontSize: 13 }}>{L ? 'Aucune exception.' : 'No overrides.'}</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {overrides.map((o) => (
                <li key={o.parent_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{o.email}</span>
                  <Switch
                    checked={o.enabled}
                    disabled={!canEdit || rowBusy}
                    onChange={(next) => putOverride(o.email, next)}
                    ariaLabel={`${o.email} — ${row.key}`}
                  />
                  {canEdit && (
                    <button type="button" className="btn ghost sm" onClick={() => removeOverride(o.email)} disabled={rowBusy}>
                      {L ? 'Retirer' : 'Remove'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (() => {
            const already = new Set((overrides ?? []).map((o) => o.email));
            const available = parents.filter((p) => !already.has(p.email));
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <select
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={available.length === 0}
                  style={{ flex: 1, minWidth: 0 }}
                  aria-label={L ? 'compte parent' : 'parent account'}
                >
                  <option value="">
                    {available.length === 0
                      ? (L ? '— tous les parents ont déjà une exception —' : '— all parents already overridden —')
                      : (L ? '— choisir un parent —' : '— choose a parent —')}
                  </option>
                  {available.map((p) => (
                    <option key={p.email} value={p.email}>
                      {p.email}
                      {p.children_count ? ` (${p.children_count} ${L ? 'enfant(s)' : 'kid(s)'})` : ''}
                    </option>
                  ))}
                </select>
                <Switch checked={enabled} onChange={setEnabled} ariaLabel={L ? 'activé pour ce parent' : 'enabled for this parent'} />
                <button type="button" className="btn sm" onClick={addOverride} disabled={rowBusy || !email}>
                  {L ? 'Ajouter' : 'Add'}
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
