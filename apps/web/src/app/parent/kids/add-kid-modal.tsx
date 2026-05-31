'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Language } from '@gabee/types';

// P1 — Add a kid (parent spec §7.2). Modal triggered from the kids list. Submits
// the API-supported subset (name/avatar/language) immediately and stores the
// Phase 1 metadata locally — birthday / school level / objectives are captured
// per spec but not yet persisted server-side (no schema column).

const AVATARS = ['avatar_1', 'avatar_2', 'avatar_3', 'avatar_4'] as const;
type Avatar = (typeof AVATARS)[number];

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
  const limitTitle = lang === 'fr' ? 'Limite de 3 enfants atteinte' : '3-kid limit reached';

  const trigger =
    variant === 'card' ? (
      <button
        type="button"
        className="kid-add-card"
        disabled={atLimit}
        title={atLimit ? limitTitle : ''}
        onClick={() => setOpen(true)}
      >
        <span className="plus" aria-hidden>
          +
        </span>
        {label}
      </button>
    ) : (
      <button
        type="button"
        className={'btn mint' + (variant === 'primary-lg' ? ' lg' : '')}
        disabled={atLimit}
        title={atLimit ? limitTitle : ''}
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

function AddKidModal({ lang, onClose }: { lang: Language; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [avatar, setAvatar] = useState<Avatar>('avatar_1');
  const [language, setLanguage] = useState<Language>(lang);
  const [school, setSchool] = useState<(typeof SCHOOL_LEVELS)[number]>('CP');
  const [objectives, setObjectives] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // birthday/school/objectives/extra: collected per spec §7.2 but not yet
  // persisted server-side. Kept in state so the form behaves as designed and
  // the data is ready when the API accepts them.
  void birthday;
  void school;
  void objectives;
  void extra;

  const canSave = name.trim().length >= 2 && !!avatar && !!birthday;

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
        body: JSON.stringify({ name: name.trim(), avatar, language }),
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
            avatar={avatar}
            setAvatar={setAvatar}
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
  avatar,
  setAvatar,
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
  avatar: Avatar;
  setAvatar: (v: Avatar) => void;
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
        <label>{lang === 'fr' ? 'Prénom' : 'First name'}</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 20))}
          placeholder={lang === 'fr' ? "Le prénom de votre enfant" : "Your kid's first name"}
          maxLength={20}
        />
        <span className="hint">{lang === 'fr' ? '2 à 20 caractères' : '2–20 characters'}</span>
      </div>

      <div className="field">
        <label>{lang === 'fr' ? 'Date de naissance' : 'Birthday'}</label>
        <input
          className="input"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
        />
      </div>

      <div className="field">
        <label>{lang === 'fr' ? 'Avatar' : 'Avatar'}</label>
        <div className="avatar-pick">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              className={'avatar-opt' + (avatar === a ? ' on' : '')}
              onClick={() => setAvatar(a)}
              aria-pressed={avatar === a}
              aria-label={a}
            >
              <AvatarSwatch avatar={a} size={64} />
              {avatar === a && (
                <span className="chk" aria-hidden>
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{lang === 'fr' ? 'Langue' : 'Language'}</label>
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

      <div className="field">
        <label>{lang === 'fr' ? 'Niveau scolaire' : 'School level'}</label>
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

      <div className="field" style={{ marginBottom: 0 }}>
        <label>
          {lang === 'fr' ? "Objectifs d'apprentissage" : 'Learning objectives'}
        </label>
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
        />
      </div>
    </>
  );
}

function AvatarSwatch({ avatar, size }: { avatar: Avatar; size: number }) {
  const color =
    avatar === 'avatar_2'
      ? 'var(--module-words)'
      : avatar === 'avatar_3'
        ? 'var(--module-keyboard)'
        : avatar === 'avatar_4'
          ? 'var(--coral)'
          : 'var(--mint)';
  return (
    <span
      className="kid-av"
      aria-hidden
      style={{ width: size, height: size, background: color, display: 'inline-block' }}
    />
  );
}
