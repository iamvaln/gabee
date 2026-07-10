'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_AVATAR_LOOK, type Language } from '@gabee/types';
import { KidFormFields } from './kids/add-kid-modal';
import type { AvatarLook } from './_components/avatar-picker';

// First-run kid creation (parent spec §7.2). Shown on the parent home page
// when the account has zero kids yet — same shell as the AddKidModal in the
// kids list, just inline (no modal) so a brand-new parent gets to fill the
// form without a layer above the welcome state. Field set, validation, and
// POST body are intentionally identical to the modal so the two surfaces
// stay in lockstep: a kid added here looks the same as one added later.

const SCHOOL_LEVELS = ['CP', 'CE1', 'CE2', 'autre'] as const;

export function AddChildForm({ lang = 'fr' }: { lang?: Language }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [look, setLook] = useState<AvatarLook>({
    skinTone: DEFAULT_AVATAR_LOOK.skinTone,
    hairColor: DEFAULT_AVATAR_LOOK.hairColor,
    hairStyle: DEFAULT_AVATAR_LOOK.hairStyle,
    shirtColor: DEFAULT_AVATAR_LOOK.shirtColor,
    gender: null,
  });
  const [language, setLanguage] = useState<Language>(lang);
  const [school, setSchool] = useState<(typeof SCHOOL_LEVELS)[number]>('CP');
  const [objectives, setObjectives] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Co-parent share (parent spec §10). A parent who invited a co-parent BEFORE
  // adding their first kid still needs the same opt-in checkbox the modal
  // shows, so the new kid surfaces (or not) on the co-parent's side per
  // explicit consent. Safe to call /api/family on mount — the response is
  // small and the form is interactive immediately.
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
        // Best-effort — the form still works without the checkbox.
      }
    })();
  }, []);

  // school / objectives / extra: collected per spec §7.2 but not yet persisted
  // server-side (no column). Read locally only; explicitly void so lint
  // doesn't flag the unused setters.
  void school;
  void objectives;
  void extra;

  const canSave = name.trim().length >= 2 && !!birthday;

  const toggleObj = (id: string) =>
    setObjectives((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          hair_style: look.hairStyle,
          shirt_color: look.shirtColor,
          ...(look.gender ? { gender: look.gender } : {}),
          language,
          birth_date: birthday || undefined,
          ...(coparentNames.length > 0 ? { share_with_existing_coparents: shareWithCoparents } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? (lang === 'fr' ? "Impossible d'ajouter le profil." : 'Could not add kid'));
      }
      // Don't reset state — the route refresh will swap to the populated
      // dashboard, unmounting this form.
      router.refresh();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Could not add kid');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <KidFormFields
        lang={language}
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
            marginTop: 12,
            padding: 14,
            borderRadius: 12,
            background: 'var(--mint-soft, #DCFCE7)',
            border: '1px solid var(--mint-deep, #15803d)',
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
                {language === 'fr' ? 'Partager avec ' : 'Share with '}
                {coparentNames.length === 1 ? coparentNames[0] : (language === 'fr' ? 'vos co-parents' : 'your co-parents')}
              </strong>
              <div style={{ fontWeight: 600, color: 'var(--text-2)', marginTop: 4 }}>
                {language === 'fr'
                  ? `Si activé, ${coparentNames.length === 1 ? coparentNames[0] : 'vos co-parents'} verront ce nouvel enfant comme leurs autres.`
                  : `If on, ${coparentNames.length === 1 ? coparentNames[0] : 'your co-parents'} will see this new kid alongside their others.`}
              </div>
            </span>
          </label>
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--feedback-retry)', fontWeight: 800, margin: '12px 0 0' }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          className="btn mint"
          disabled={!canSave || busy}
        >
          {busy
            ? (language === 'fr' ? 'Ajout…' : 'Adding…')
            : (language === 'fr' ? 'Ajouter un enfant' : 'Add a kid')}
        </button>
      </div>
    </form>
  );
}
