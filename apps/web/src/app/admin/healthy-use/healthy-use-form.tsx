'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HealthyUseLimits, Language } from '@gabee/types';

// Order + labels for the 4 triplet parameters. Keeps the grid stable across
// re-renders and the FR/EN copy in one place.
const TRIPLET_FIELDS = [
  {
    key: 'daily_lesson_target' as const,
    fr: 'Objectif quotidien',
    en: 'Daily lesson target',
    unit: { fr: 'leçons/jour', en: 'lessons/day' },
    helpFr: 'Nombre de leçons par jour que vise un enfant.',
    helpEn: 'Daily lesson target for a kid.',
  },
  {
    key: 'session_soft_limit_min' as const,
    fr: 'Pause suggérée',
    en: 'Soft limit',
    unit: { fr: 'min', en: 'min' },
    helpFr: 'Au-delà, l’app suggère une pause à l’enfant.',
    helpEn: 'Beyond this, the app suggests a break.',
  },
  {
    key: 'session_hard_cap_min' as const,
    fr: 'Limite stricte de session',
    en: 'Hard cap per session',
    unit: { fr: 'min', en: 'min' },
    helpFr: 'Termine la session automatiquement.',
    helpEn: 'Ends the session automatically.',
  },
  {
    key: 'daily_total_cap_min' as const,
    fr: 'Cumul quotidien max',
    en: 'Daily total cap',
    unit: { fr: 'min', en: 'min' },
    helpFr: 'Verrouille l’app jusqu’au lendemain.',
    helpEn: 'Locks the app until tomorrow.',
  },
];

type TripletKey = (typeof TRIPLET_FIELDS)[number]['key'];

interface Props {
  initial: HealthyUseLimits;
  canEdit: boolean;
  lang: Language;
}

/**
 * Edit form for the healthy-use singleton. Validates min ≤ default ≤ max
 * client-side (the server re-validates and 400s if anyone bypasses). Saving
 * sends the WHOLE state — the server treats the request as a partial merge so
 * over-sending is safe.
 */
export function HealthyUseForm({ initial, canEdit, lang }: Props) {
  const L = lang === 'fr';
  const router = useRouter();
  const [state, setState] = useState<HealthyUseLimits>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setTriplet(key: TripletKey, sub: 'min' | 'default' | 'max', raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const v = Math.max(0, Math.round(n));
    setState((cur) => ({ ...cur, [key]: { ...cur[key], [sub]: v } }));
    setSaved(false);
    setErr(null);
  }
  function setScalar<K extends 'look_away_interval_min' | 'look_away_pause_sec'>(key: K, raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setState((cur) => ({ ...cur, [key]: Math.max(1, Math.round(n)) }));
    setSaved(false);
  }
  function setFlag<K extends 'look_away_enabled_default' | 'streak_enabled' | 'badges_enabled'>(key: K, value: boolean) {
    setState((cur) => ({ ...cur, [key]: value }));
    setSaved(false);
  }

  const invalidKey = TRIPLET_FIELDS.find(
    (f) => state[f.key].min > state[f.key].default || state[f.key].default > state[f.key].max,
  )?.key;

  async function save() {
    if (busy || !canEdit) return;
    if (invalidKey) {
      setErr(L ? `Triplet invalide : min ≤ défaut ≤ max requis (${invalidKey}).` : `Invalid triplet (${invalidKey}).`);
      return;
    }
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/healthy-use-limits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Save failed');
      }
      setSaved(true);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad mt8" style={{ maxWidth: 880 }}>
      {!canEdit && (
        <div
          style={{
            background: '#F1F5F9', borderRadius: 8, padding: '8px 12px', marginBottom: 16,
            fontSize: 13, color: '#475569',
          }}
        >
          {L ? 'Lecture seule — réservé aux super admins.' : 'Read-only — super admins only.'}
        </div>
      )}

      <div className="section-label" style={{ marginBottom: 12 }}>
        {L ? 'Triplets (min, défaut, max)' : 'Triplets (min, default, max)'}
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {TRIPLET_FIELDS.map((f) => {
          const triplet = state[f.key];
          const bad = triplet.min > triplet.default || triplet.default > triplet.max;
          return (
            <div key={f.key}>
              <label style={{ fontWeight: 700, fontSize: 14 }}>
                {L ? f.fr : f.en}
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, opacity: 0.6 }}>
                  · {L ? f.unit.fr : f.unit.en}
                </span>
              </label>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {(['min', 'default', 'max'] as const).map((sub) => (
                  <div key={sub} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase' }}>
                      {sub === 'default' ? (L ? 'Défaut' : 'Default') : sub}
                    </span>
                    <input
                      type="number"
                      className="input"
                      disabled={!canEdit}
                      value={triplet[sub]}
                      onChange={(e) => setTriplet(f.key, sub, e.target.value)}
                      style={{
                        width: 80,
                        borderColor: bad ? '#dc2626' : undefined,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                {L ? f.helpFr : f.helpEn}
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-label" style={{ marginTop: 24, marginBottom: 12 }}>
        {L ? 'Pauses des yeux (20-20-20)' : 'Look-away breaks (20-20-20)'}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>{L ? 'Intervalle' : 'Interval'}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              className="input"
              disabled={!canEdit}
              value={state.look_away_interval_min}
              onChange={(e) => setScalar('look_away_interval_min', e.target.value)}
              style={{ width: 80 }}
            />
            <span style={{ fontSize: 13, opacity: 0.7 }}>min</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>{L ? 'Durée de pause' : 'Pause duration'}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              className="input"
              disabled={!canEdit}
              value={state.look_away_pause_sec}
              onChange={(e) => setScalar('look_away_pause_sec', e.target.value)}
              style={{ width: 80 }}
            />
            <span style={{ fontSize: 13, opacity: 0.7 }}>s</span>
          </div>
        </div>
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            paddingTop: 16, fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={state.look_away_enabled_default}
            onChange={(e) => setFlag('look_away_enabled_default', e.target.checked)}
          />
          {L ? 'Activé par défaut' : 'Enabled by default'}
        </label>
      </div>

      <div className="section-label" style={{ marginTop: 24, marginBottom: 12 }}>
        {L ? 'Encouragements' : 'Encouragement'}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={state.streak_enabled}
            onChange={(e) => setFlag('streak_enabled', e.target.checked)}
          />
          {L ? 'Streak (consécutivité)' : 'Streak'}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={state.badges_enabled}
            onChange={(e) => setFlag('badges_enabled', e.target.checked)}
          />
          {L ? 'Badges' : 'Badges'}
        </label>
      </div>

      {err && <p style={{ color: '#dc2626', fontWeight: 700, marginTop: 16 }}>{err}</p>}
      {saved && (
        <p style={{ color: '#15803d', fontWeight: 700, marginTop: 16 }}>
          {L ? 'Limites enregistrées.' : 'Limits saved.'}
        </p>
      )}

      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn mint" onClick={save} disabled={busy}>
            {busy ? (L ? 'Enregistrement…' : 'Saving…') : L ? 'Enregistrer' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
