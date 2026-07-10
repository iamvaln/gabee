'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_AVATAR_LOOK,
  type Gender,
  type HairColor,
  type HairStyle,
  type HealthyUseLimits,
  type KidLimitsOverrides,
  type Language,
  type ShirtColor,
  type SkinTone,
} from '@gabee/types';
import { KidFormFields } from '../../add-kid-modal';
import type { AvatarLook } from '../../../_components/avatar-picker';

interface Props {
  lang: Language;
  id: string;
  name: string;
  skinTone: SkinTone;
  hairColor: HairColor;
  hairStyle: HairStyle;
  shirtColor: ShirtColor;
  gender: Gender | null;
  language: Language;
  birthDate: string | null;
}

/**
 * K3 edit form + P2 remove section (parent spec §7.4). The API today persists
 * only name / avatar / language / audio_enabled; spec-mandated metadata
 * (birthday, school, objectives) is collected but client-only until the
 * schema grows columns. Remove flow requires typing the kid's name to
 * confirm — matches the destructive pattern in the design.
 */
export function EditKidForm({
  lang,
  id,
  name: initialName,
  skinTone: initialSkin,
  hairColor: initialHair,
  hairStyle: initialStyle,
  shirtColor: initialShirt,
  gender: initialGender,
  language: initialLanguage,
  birthDate: initialBirthDate,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [birthday, setBirthday] = useState(initialBirthDate ?? '');
  const [look, setLook] = useState<AvatarLook>({
    skinTone: initialSkin ?? DEFAULT_AVATAR_LOOK.skinTone,
    hairColor: initialHair ?? DEFAULT_AVATAR_LOOK.hairColor,
    hairStyle: initialStyle ?? DEFAULT_AVATAR_LOOK.hairStyle,
    shirtColor: initialShirt ?? DEFAULT_AVATAR_LOOK.shirtColor,
    gender: initialGender,
  });
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [school, setSchool] = useState<'CP' | 'CE1' | 'CE2' | 'autre'>('CP');
  const [objectives, setObjectives] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  void school;
  void objectives;
  void extra;

  const toggleObj = (oid: string) =>
    setObjectives((cur) => (cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid]));

  const canSave = name.trim().length >= 2;

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/profiles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          skin_tone: look.skinTone,
          hair_color: look.hairColor,
          hair_style: look.hairStyle,
          shirt_color: look.shirtColor,
          gender: look.gender,
          language,
          ...(birthday ? { birth_date: birthday } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Save failed');
      }
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <KidFormFields
          lang={lang}
          name={name}
          setName={setName}
          birthday={birthday}
          setBirthday={setBirthday}
          look={look}
          setLook={setLook}
          language={language}
          setLanguage={setLanguage}
          school={school}
          setSchool={setSchool}
          objectives={objectives}
          toggleObj={toggleObj}
          extra={extra}
          setExtra={setExtra}
        />

        {error && (
          <p style={{ color: 'var(--bad)', fontWeight: 800, marginTop: 12 }}>{error}</p>
        )}
        {saved && (
          <p style={{ color: 'var(--ok)', fontWeight: 800, marginTop: 12 }}>
            {lang === 'fr' ? 'Enregistré.' : 'Saved.'}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            type="button"
            className="btn mint"
            onClick={save}
            disabled={!canSave || busy}
          >
            {busy
              ? lang === 'fr'
                ? 'Enregistrement…'
                : 'Saving…'
              : lang === 'fr'
                ? 'Enregistrer'
                : 'Save changes'}
          </button>
        </div>
      </div>

      <LimitsSection lang={lang} id={id} kidName={initialName} />

      <RemoveSection lang={lang} id={id} kidName={initialName} />
    </div>
  );
}

interface NumericFieldProps {
  lang: Language;
  labelFr: string;
  labelEn: string;
  unit: string;
  bounds: { min: number; default: number; max: number };
  value: number | null;
  onChange: (v: number | null) => void;
  helpFr: string;
  helpEn: string;
}

function NumericOverrideField({
  lang,
  labelFr,
  labelEn,
  unit,
  bounds,
  value,
  onChange,
  helpFr,
  helpEn,
}: NumericFieldProps) {
  const L = lang === 'fr';
  const isOverride = value !== null;
  const display = value ?? bounds.default;

  return (
    <div className="field" style={{ marginBottom: 16 }}>
      <label>
        {L ? labelFr : labelEn}
        {!isOverride && (
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, opacity: 0.6 }}>
            {L ? '(par défaut)' : '(default)'}
          </span>
        )}
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="number"
          className="input"
          min={bounds.min}
          max={bounds.max}
          value={display}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.max(bounds.min, Math.min(bounds.max, Math.round(n))));
          }}
          style={{ width: 100 }}
        />
        <span style={{ fontSize: 13, opacity: 0.7 }}>{unit}</span>
        {isOverride && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => onChange(null)}
            style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 12 }}
          >
            {L ? 'Revenir à la valeur par défaut' : 'Use default'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
        {L
          ? `${helpFr} · admin : min ${bounds.min}, défaut ${bounds.default}, max ${bounds.max}`
          : `${helpEn} · admin: min ${bounds.min}, default ${bounds.default}, max ${bounds.max}`}
      </div>
    </div>
  );
}

/**
 * Per-kid healthy-use override editor (product §6.3). The admin defines
 * triplets (min, default, max); the parent picks within those bounds per kid,
 * or leaves the field unset to inherit the admin default. Look-away on/off is
 * a tri-state: inherit / on / off.
 *
 * Reads two endpoints on mount:
 *  - GET /api/healthy-use-limits → the admin bounds (read-only for parents)
 *  - GET /api/profiles/:id/limits → this kid's overrides
 * Writes only the changed fields via PATCH so omitted fields stay as-they-were.
 */
function LimitsSection({
  lang,
  id,
}: {
  lang: Language;
  id: string;
  kidName: string;
}) {
  const L = lang === 'fr';
  const [bounds, setBounds] = useState<HealthyUseLimits | null>(null);
  const [overrides, setOverrides] = useState<KidLimitsOverrides | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [b, o] = await Promise.all([
          fetch('/api/healthy-use-limits').then((r) => r.json()) as Promise<HealthyUseLimits>,
          fetch(`/api/profiles/${id}/limits`).then((r) => r.json()) as Promise<KidLimitsOverrides>,
        ]);
        setBounds(b);
        setOverrides(o);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Load failed');
      }
    }
    void load();
  }, [id]);

  function set<K extends keyof KidLimitsOverrides>(key: K, value: KidLimitsOverrides[K]) {
    setOverrides((cur) => (cur ? { ...cur, [key]: value } : cur));
    setSaved(false);
  }

  async function save() {
    if (!overrides || busy) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/profiles/${id}/limits`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrides),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Save failed');
      }
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  if (!bounds || !overrides) {
    return (
      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <div className="section-label">{L ? 'Limites & temps d’écran' : 'Limits & screen time'}</div>
        <p style={{ fontSize: 13, opacity: 0.6 }}>{L ? 'Chargement…' : 'Loading…'}</p>
      </div>
    );
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 24 }}>
      <div className="section-label" style={{ marginBottom: 14 }}>
        {L ? 'Limites & temps d’écran' : 'Limits & screen time'}
      </div>
      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
        {L
          ? 'Ajustez ces valeurs pour cet enfant. Sans modification, les valeurs par défaut définies par l’admin s’appliquent.'
          : 'Adjust per kid. Leave blank to inherit the admin defaults.'}
      </p>

      <NumericOverrideField
        lang={lang}
        labelFr="Objectif quotidien"
        labelEn="Daily lesson target"
        unit={L ? 'leçons/jour' : 'lessons/day'}
        bounds={bounds.daily_lesson_target}
        value={overrides.daily_lesson_target}
        onChange={(v) => set('daily_lesson_target', v)}
        helpFr="Le nombre de leçons que vise votre enfant chaque jour."
        helpEn="How many lessons the kid aims for each day."
      />

      <NumericOverrideField
        lang={lang}
        labelFr="Pause suggérée"
        labelEn="Soft limit"
        unit="min"
        bounds={bounds.session_soft_limit_min}
        value={overrides.session_soft_limit_min}
        onChange={(v) => set('session_soft_limit_min', v)}
        helpFr="Au-delà, Gabee propose une pause (votre enfant peut continuer)."
        helpEn="Beyond this, Gabee suggests a break (the kid can keep going)."
      />

      <NumericOverrideField
        lang={lang}
        labelFr="Limite stricte de session"
        labelEn="Hard cap (per session)"
        unit="min"
        bounds={bounds.session_hard_cap_min}
        value={overrides.session_hard_cap_min}
        onChange={(v) => set('session_hard_cap_min', v)}
        helpFr="Au-delà, la session se termine automatiquement."
        helpEn="The session ends when this is reached."
      />

      <NumericOverrideField
        lang={lang}
        labelFr="Cumul quotidien max"
        labelEn="Daily total cap"
        unit="min"
        bounds={bounds.daily_total_cap_min}
        value={overrides.daily_total_cap_min}
        onChange={(v) => set('daily_total_cap_min', v)}
        helpFr="Quand atteint, l’appli se verrouille jusqu’au lendemain."
        helpEn="When reached, the app locks until tomorrow."
      />

      <div className="field" style={{ marginBottom: 16 }}>
        <label>{L ? 'Pause des yeux (20-20-20)' : 'Look-away breaks (20-20-20)'}</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {(
            [
              [null, L ? 'Par défaut' : 'Default'],
              [true, L ? 'Activé' : 'On'],
              [false, L ? 'Désactivé' : 'Off'],
            ] as const
          ).map(([v, label]) => {
            const selected = overrides.look_away_enabled === v;
            return (
              <button
                key={String(v)}
                type="button"
                className={`btn ${selected ? 'mint' : 'ghost'} sm`}
                onClick={() => set('look_away_enabled', v)}
              >
                {label}
                {v === null && (
                  <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>
                    ({bounds.look_away_enabled_default ? (L ? 'activé' : 'on') : (L ? 'désactivé' : 'off')})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
          {L
            ? `Toutes les ${bounds.look_away_interval_min} min, pause de ${bounds.look_away_pause_sec} s pour regarder au loin.`
            : `Every ${bounds.look_away_interval_min} min, pause for ${bounds.look_away_pause_sec}s to look away.`}
        </div>
      </div>

      {err && <p style={{ color: 'var(--bad)', fontWeight: 700, marginTop: 0 }}>{err}</p>}
      {saved && (
        <p style={{ color: 'var(--ok)', fontWeight: 700, marginTop: 0 }}>
          {L ? 'Limites enregistrées.' : 'Limits saved.'}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="btn mint" onClick={save} disabled={busy}>
          {busy ? (L ? 'Enregistrement…' : 'Saving…') : L ? 'Enregistrer les limites' : 'Save limits'}
        </button>
      </div>
    </div>
  );
}

function RemoveSection({
  lang,
  id,
  kidName,
}: {
  lang: Language;
  id: string;
  kidName: string;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = typed.trim() === kidName;

  async function remove() {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Remove failed');
      }
      router.push('/parent/kids');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
      setBusy(false);
    }
  }

  return (
    <div
      className="card card-pad"
      style={{ borderColor: 'var(--bad-bg)' }}
    >
      <div className="section-label" style={{ color: 'var(--bad)', marginBottom: 10 }}>
        <span aria-hidden>!</span>
        {lang === 'fr' ? 'Retirer ce profil' : 'Remove this profile'}
        <span className="ln" />
      </div>
      <p style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: 14, marginTop: 0, lineHeight: 1.6 }}>
        {lang === 'fr'
          ? `Le profil de ${kidName}, ses sessions, classements et retours seront supprimés (récupérables pendant 30 jours).`
          : `${kidName}'s profile, sessions, classifications and feedback will be deleted (recoverable for 30 days).`}
      </p>
      <div className="field" style={{ marginBottom: 16 }}>
        <label>
          {lang === 'fr'
            ? `Tapez « ${kidName} » pour confirmer`
            : `Type "${kidName}" to confirm`}
        </label>
        <input
          className={'input' + (typed && !ok ? ' bad' : '')}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={kidName}
        />
      </div>
      {error && (
        <p style={{ color: 'var(--bad)', fontWeight: 800 }}>{error}</p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn danger"
          onClick={remove}
          disabled={!ok || busy}
          style={
            ok
              ? { background: 'var(--bad)', color: '#fff', borderColor: 'var(--bad)' }
              : undefined
          }
        >
          <span aria-hidden>🗑</span>
          {busy
            ? lang === 'fr'
              ? 'Retrait…'
              : 'Removing…'
            : lang === 'fr'
              ? 'Retirer définitivement'
              : 'Remove permanently'}
        </button>
      </div>
    </div>
  );
}
