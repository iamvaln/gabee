'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_AVATAR_LOOK, type Language } from '@gabee/types';
import { AvatarPicker, type AvatarLook } from '../_components/avatar-picker';

// P1 — Add a kid (parent spec §7.2). Modal triggered from the kids list. Submits
// the API-supported subset (name/avatar look/language) immediately and stores the
// Phase 1 metadata locally — birthday / school level / objectives are captured
// per spec but not yet persisted server-side (no schema column).

const OBJECTIVES: { id: string; label: { fr: string; en: string } }[] = [
  { id: 'math_basics', label: { fr: 'Bases en maths', en: 'Math basics' } },
  { id: 'reading', label: { fr: 'Lecture', en: 'Reading' } },
  { id: 'writing', label: { fr: 'Écriture', en: 'Writing' } },
  { id: 'english', label: { fr: 'Anglais', en: 'English' } },
  { id: 'logic_coding', label: { fr: 'Logique / code', en: 'Logic / coding' } },
];

const SCHOOL_LEVELS = ['CP', 'CE1', 'CE2', 'autre'] as const;

interface LauncherProps {
  label: string;
  atLimit: boolean;
  variant: 'primary' | 'primary-lg' | 'card';
  lang: Language;
}

/**
 * Button + controlled modal. Three button variants:
 *  - primary    →  small mint pill button (page header)
 *  - primary-lg →  large mint button (empty-state CTA)
 *  - card       →  dashed add-card slot in the kid grid
 */
export function AddKidModalLauncher({ label, atLimit, variant, lang }: LauncherProps) {
  const [open, setOpen] = useState(false);

  // At the cap, we don't dead-end on a disabled button — the parent can ask the
  // operator to raise the limit. The request lands in the admin Inbox.
  if (atLimit) {
    return <RequestMoreProfiles lang={lang} variant={variant} />;
  }

  const trigger =
    variant === 'card' ? (
      <button type="button" className="kid-add-card" onClick={() => setOpen(true)}>
        <span className="plus" aria-hidden>
          +
        </span>
        {label}
      </button>
    ) : (
      <button
        type="button"
        className={'btn mint' + (variant === 'primary-lg' ? ' lg' : '')}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>+</span>
        {label}
      </button>
    );

  return (
    <>
      {trigger}
      {open && <AddKidModal lang={lang} onClose={() => setOpen(false)} />}
    </>
  );
}

// Shown when the parent is at the 3-profile cap: a button that submits a
// "please raise my limit" request to the operator (admin Inbox), with a sent /
// error state. No dead-disabled add button.
function RequestMoreProfiles({ lang, variant }: { lang: Language; variant: LauncherProps['variant'] }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const L = lang === 'fr';

  async function submit() {
    if (state === 'sending' || state === 'sent') return;
    setState('sending');
    try {
      const res = await fetch('/api/profiles/request-increase', { method: 'POST' });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <span className="hint" style={{ fontWeight: 700, color: 'var(--mint-deep)' }}>
        {L ? 'Demande envoyée ✓ — on revient vers vous.' : 'Request sent ✓ — we’ll get back to you.'}
      </span>
    );
  }

  const cls = variant === 'card' ? 'kid-add-card' : 'btn secondary' + (variant === 'primary-lg' ? ' lg' : '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: variant === 'card' ? 'stretch' : 'flex-start' }}>
      <button type="button" className={cls} onClick={submit} disabled={state === 'sending'}>
        {state === 'sending'
          ? L ? 'Envoi…' : 'Sending…'
          : L ? 'Demander plus de profils' : 'Request more profiles'}
      </button>
      <span className="hint" style={{ fontSize: 12, color: 'var(--text-3)' }}>
        {state === 'error'
          ? L ? 'Échec — réessayez.' : 'Failed — try again.'
          : L ? `Limite de ${3} profils atteinte.` : `${3}-profile limit reached.`}
      </span>
    </div>
  );
}

function AddKidModal({ lang, onClose }: { lang: Language; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [look, setLook] = useState<AvatarLook>({
    skinTone: DEFAULT_AVATAR_LOOK.skinTone,
    hairColor: DEFAULT_AVATAR_LOOK.hairColor,
    shirtColor: DEFAULT_AVATAR_LOOK.shirtColor,
  });
  const [language, setLanguage] = useState<Language>(lang);
  const [school, setSchool] = useState<(typeof SCHOOL_LEVELS)[number]>('CP');
  const [objectives, setObjectives] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Co-parent extension policy (parent spec §10). On mount we ask /api/family
  // for the requester's links; if any have `role === 'coparent'` the new-kid
  // form surfaces a checkbox so the parent can opt OUT of sharing the new kid
  // with them. Defaults to extend (true) — historical "both parents see all
  // kids" behaviour, which we keep until the parent says otherwise.
  const [coparentNames, setCoparentNames] = useState<string[]>([]);
  const [shareWithCoparents, setShareWithCoparents] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/family');
        if (!res.ok) return;
        const data = (await res.json()) as { links?: { role: string; display_name_for_kids?: string; email?: string }[] };
        const cps = (data.links ?? []).filter((l) => l.role === 'coparent');
        setCoparentNames(cps.map((l) => l.display_name_for_kids || l.email || '—'));
      } catch {
        // Best-effort — the modal still works without the checkbox.
      }
    })();
  }, []);

  // school/objectives/extra: collected per spec §7.2 but not yet persisted
  // server-side. birthday IS now persisted (drives age-based content selection).
  void school;
  void objectives;
  void extra;

  const canSave = name.trim().length >= 2 && !!birthday;

  const toggleObj = (id: string) =>
    setObjectives((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function submit() {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          skin_tone: look.skinTone,
          hair_color: look.hairColor,
          shirt_color: look.shirtColor,
          language,
          birth_date: birthday || undefined,
          // Only send the flag when we actually surfaced the choice — keeps
          // the request minimal for parents with no co-parents (server
          // defaults to `true` for backwards compat).
          ...(coparentNames.length > 0 ? { share_with_existing_coparents: shareWithCoparents } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not add kid');
      }
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add kid');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div
        className="modal wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={lang === 'fr' ? 'Ajouter un enfant' : 'Add a kid'}
        style={{ maxHeight: '94vh' }}
      >
        <div className="modal-head">
          <span style={{ color: 'var(--mint-deep)' }} aria-hidden>
            +
          </span>
          <h2>{lang === 'fr' ? 'Ajouter un enfant' : 'Add a kid'}</h2>
          <button
            type="button"
            className="close-x mh-close"
            onClick={onClose}
            aria-label="close"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
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

          {coparentNames.length > 0 && (
            <div
              className="card-pad"
              style={{
                marginTop: 12, padding: 14, borderRadius: 12,
                background: 'var(--mint-soft, #DCFCE7)', border: '1px solid var(--mint-deep, #15803d)',
              }}
            >
              <label
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14, lineHeight: 1.5 }}
              >
                <input
                  type="checkbox"
                  checked={shareWithCoparents}
                  onChange={(e) => setShareWithCoparents(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong>
                    {lang === 'fr' ? 'Partager avec ' : 'Share with '}
                    {coparentNames.length === 1 ? coparentNames[0] : (lang === 'fr' ? 'vos co-parents' : 'your co-parents')}
                  </strong>
                  <div style={{ fontWeight: 600, color: 'var(--text-2)', marginTop: 4 }}>
                    {lang === 'fr'
                      ? `Si activé, ${coparentNames.length === 1 ? coparentNames[0] : 'vos co-parents'} verront ce nouvel enfant comme leurs autres.`
                      : `If on, ${coparentNames.length === 1 ? coparentNames[0] : 'your co-parents'} will see this new kid alongside their others.`}
                  </div>
                </span>
              </label>
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--bad)', fontWeight: 800, margin: '12px 0 0' }}>{error}</p>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            {lang === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
          <div className="grow" />
          <button
            type="button"
            className="btn mint"
            onClick={submit}
            disabled={!canSave || busy}
          >
            {busy
              ? lang === 'fr'
                ? 'Ajout…'
                : 'Adding…'
              : lang === 'fr'
                ? 'Ajouter un enfant'
                : 'Add a kid'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Shared field block — used by the add modal here and by the K3 edit page. We
 * don't inline this on the edit page so the two surfaces stay in lockstep
 * visually.
 */
export function KidFormFields({
  lang,
  name,
  setName,
  birthday,
  setBirthday,
  look,
  setLook,
  language,
  setLanguage,
  school,
  setSchool,
  objectives,
  toggleObj,
  extra,
  setExtra,
}: {
  lang: Language;
  name: string;
  setName: (v: string) => void;
  birthday: string;
  setBirthday: (v: string) => void;
  look: AvatarLook;
  setLook: (v: AvatarLook) => void;
  language: Language;
  setLanguage: (v: Language) => void;
  school: (typeof SCHOOL_LEVELS)[number];
  setSchool: (v: (typeof SCHOOL_LEVELS)[number]) => void;
  objectives: string[];
  toggleObj: (id: string) => void;
  extra: string;
  setExtra: (v: string) => void;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="kf-name">{lang === 'fr' ? 'Prénom' : 'First name'}</label>
        <input
          id="kf-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 20))}
          placeholder={lang === 'fr' ? "Le prénom de votre enfant" : "Your kid's first name"}
          maxLength={20}
        />
        <span className="hint">{lang === 'fr' ? '2 à 20 caractères' : '2–20 characters'}</span>
      </div>

      <div className="field">
        <label htmlFor="kf-birthday">{lang === 'fr' ? 'Date de naissance' : 'Birthday'}</label>
        <input
          id="kf-birthday"
          className="input"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
        />
      </div>

      <div className="field" role="group" aria-labelledby="kf-avatar-lbl">
        <span id="kf-avatar-lbl" className="field-label-text" style={{ fontWeight: 800, fontSize: 13.5, display: 'block', color: 'var(--text)' }}>{lang === 'fr' ? 'Avatar' : 'Avatar'}</span>
        <AvatarPicker value={look} onChange={setLook} lang={lang} name={name} />
      </div>

      <div className="field" role="group" aria-labelledby="kf-language-lbl">
        <span id="kf-language-lbl" className="field-label-text" style={{ fontWeight: 800, fontSize: 13.5, display: 'block', color: 'var(--text)' }}>{lang === 'fr' ? 'Langue' : 'Language'}</span>
        <div className="seg">
          {(['fr', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={language === l ? 'on' : ''}
              onClick={() => setLanguage(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="field" role="group" aria-labelledby="kf-school-lbl">
        <span id="kf-school-lbl" className="field-label-text" style={{ fontWeight: 800, fontSize: 13.5, display: 'block', color: 'var(--text)' }}>{lang === 'fr' ? 'Niveau scolaire' : 'School level'}</span>
        <div className="seg">
          {SCHOOL_LEVELS.map((s) => (
            <button
              key={s}
              type="button"
              className={school === s ? 'on' : ''}
              onClick={() => setSchool(s)}
            >
              {s === 'autre' ? (lang === 'fr' ? 'autre' : 'other') : s}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }} role="group" aria-labelledby="kf-obj-lbl">
        <span id="kf-obj-lbl" className="field-label-text" style={{ fontWeight: 800, fontSize: 13.5, display: 'block', color: 'var(--text)' }}>
          {lang === 'fr' ? "Objectifs d'apprentissage" : 'Learning objectives'}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          {OBJECTIVES.map((o) => {
            const on = objectives.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                className={'check' + (on ? ' on' : '')}
                onClick={() => toggleObj(o.id)}
                aria-pressed={on}
              >
                <span className="box" aria-hidden>
                  {on ? '✓' : ''}
                </span>
                {o.label[lang]}
              </button>
            );
          })}
        </div>
        <textarea
          className="textarea"
          style={{ marginTop: 10, minHeight: 64 }}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder={
            lang === 'fr' ? 'Autre chose ? (optionnel)' : 'Anything else? (optional)'
          }
          aria-label={lang === 'fr' ? 'Autre chose à propos de votre enfant' : 'Anything else about your kid'}
        />
      </div>
    </>
  );
}

