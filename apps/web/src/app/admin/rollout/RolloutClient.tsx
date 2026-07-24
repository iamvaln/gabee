'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FlagKey, Language, RolloutResponse } from '@gabee/types';

type Feature = { key: FlagKey; title: string };
type ParentRow = { email: string; children_count: number };
type Status = 'none' | 'enabled' | 'notified';

export function RolloutClient({
  features,
  canEdit,
  lang,
}: {
  features: Feature[];
  canEdit: boolean;
  lang: Language;
}) {
  const L = lang === 'fr';
  const [picked, setPicked] = useState<Set<FlagKey>>(new Set());
  const [parents, setParents] = useState<ParentRow[]>([]);
  // per-flag override status: flagKey -> (email -> {enabled, notified_at})
  const [ovByFlag, setOvByFlag] = useState<Record<string, Record<string, { enabled: boolean; notified_at: string | null }>>>({});
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [enable, setEnable] = useState(true);
  const [send, setSend] = useState(true);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RolloutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/admin/users/parents')
      .then((r) => (r.ok ? r.json() : { parents: [] }))
      .then((b) => setParents((b.parents ?? []).map((p: ParentRow) => ({ email: p.email, children_count: p.children_count ?? 0 }))))
      .catch(() => {});
  }, []);

  // Load override status for each selected flag (for the per-parent annotation).
  useEffect(() => {
    for (const key of picked) {
      if (ovByFlag[key]) continue;
      void fetch(`/api/admin/flags/${key}/overrides`)
        .then((r) => (r.ok ? r.json() : { overrides: [] }))
        .then((b) =>
          setOvByFlag((prev) => ({
            ...prev,
            [key]: Object.fromEntries(
              (b.overrides ?? []).map((o: { email: string; enabled: boolean; notified_at: string | null }) => [
                o.email,
                { enabled: o.enabled, notified_at: o.notified_at },
              ]),
            ),
          })),
        )
        .catch(() => {});
    }
  }, [picked, ovByFlag]);

  // A parent's status across the selected flags: notified only if notified on ALL selected; enabled if enabled on ALL selected.
  function statusFor(email: string): Status {
    const keys = [...picked];
    if (keys.length === 0) return 'none';
    let allEnabled = true;
    let allNotified = true;
    for (const k of keys) {
      const row = ovByFlag[k]?.[email];
      if (!row || !row.enabled) allEnabled = false;
      if (!row || !row.notified_at) allNotified = false;
    }
    return allNotified ? 'notified' : allEnabled ? 'enabled' : 'none';
  }

  const enabledNotNotified = useMemo(
    () => parents.filter((p) => statusFor(p.email) === 'enabled').map((p) => p.email),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parents, picked, ovByFlag],
  );

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/flags/rollout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flags: [...picked],
          emails: [...chosen],
          enable,
          send,
          ...(subject.trim() ? { subject } : {}),
          ...(text.trim() ? { text } : {}),
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setResult(await res.json());
      // Clear the parent selection so the button disables after a successful
      // deploy — otherwise it stays clickable and a second click would re-enable
      // + re-email the same parents (overwriting their notified_at). The feature
      // selection (picked) is kept so a fresh cohort can be sent right away.
      setChosen(new Set());
      // refresh status for the touched flags (the just-notified parents now read
      // "notified" and drop out of the "enabled but not notified" filter)
      setOvByFlag({});
    } catch {
      setError(L ? "Échec de l'envoi." : 'Submit failed.');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = canEdit && picked.size > 0 && chosen.size > 0 && (enable || send) && !busy;

  return (
    <div className="card" style={{ padding: 16 }}>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      <h3>{L ? '1 · Fonctionnalités' : '1 · Features'}</h3>
      <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
        {features.map((f) => (
          <label key={f.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={picked.has(f.key)}
              disabled={!canEdit}
              onChange={(e) =>
                setPicked((s) => {
                  const n = new Set(s);
                  if (e.target.checked) n.add(f.key);
                  else n.delete(f.key);
                  return n;
                })
              }
            />
            {f.title} <span className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.key}</span>
          </label>
        ))}
      </div>

      <h3>{L ? '2 · Parents' : '2 · Parents'}</h3>
      <div style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!canEdit || enabledNotNotified.length === 0}
          onClick={() => setChosen(new Set(enabledNotNotified))}
        >
          {L ? 'Sélectionner : activés mais non avertis' : 'Select: enabled but not notified'} ({enabledNotNotified.length})
        </button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 4, maxHeight: 260, overflow: 'auto' }}>
        {parents.map((p) => {
          const st = statusFor(p.email);
          return (
            <li key={p.email} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={chosen.has(p.email)}
                disabled={!canEdit}
                onChange={(e) =>
                  setChosen((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(p.email);
                    else n.delete(p.email);
                    return n;
                  })
                }
              />
              <span style={{ flex: 1 }}>{p.email}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {st === 'notified'
                  ? L
                    ? 'averti'
                    : 'notified'
                  : st === 'enabled'
                    ? L
                      ? 'activé · non averti'
                      : 'enabled · not notified'
                    : L
                      ? 'non déployé'
                      : 'not rolled out'}
              </span>
            </li>
          );
        })}
      </ul>

      <h3>{L ? '3 · E-mail (modifiable)' : '3 · Email (editable)'}</h3>
      <input
        type="text"
        value={subject}
        placeholder={L ? 'Objet (laisser vide = auto)' : 'Subject (blank = auto)'}
        onChange={(e) => setSubject(e.target.value)}
        style={{ width: '100%', marginBottom: 8 }}
        disabled={!canEdit}
      />
      <textarea
        value={text}
        placeholder={L ? 'Corps (laisser vide = auto, bilingue)' : 'Body (blank = auto, bilingual)'}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        style={{ width: '100%', marginBottom: 12 }}
        disabled={!canEdit}
      />

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <label>
          <input type="checkbox" checked={enable} onChange={(e) => setEnable(e.target.checked)} disabled={!canEdit} />{' '}
          {L ? 'Activer les fonctionnalités' : 'Enable features'}
        </label>
        <label>
          <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} disabled={!canEdit} />{' '}
          {L ? "Envoyer l'invitation" : 'Send invite'}
        </label>
      </div>

      <button type="button" className="btn" onClick={submit} disabled={!canSubmit}>
        {busy ? '…' : L ? `Déployer pour ${chosen.size} parent(s)` : `Roll out to ${chosen.size} parent(s)`}
      </button>

      {result && (
        <div className="alert" role="status" style={{ marginTop: 16 }}>
          {L ? 'Activés' : 'Enabled'}: {result.summary.enabled} · {L ? 'Envoyés' : 'Sent'}: {result.summary.sent} ·{' '}
          {L ? 'Échecs' : 'Failed'}: {result.summary.failed}
          {result.results.some((r) => r.error) && (
            <ul style={{ margin: '8px 0 0' }}>
              {result.results
                .filter((r) => r.error)
                .map((r) => (
                  <li key={r.email}>
                    {r.email} — {r.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
