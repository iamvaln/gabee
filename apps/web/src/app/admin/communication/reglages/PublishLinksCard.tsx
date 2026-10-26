'use client';

import { useEffect, useId, useState } from 'react';
import { CONTENT_PLATFORMS, PUBLISH_URL_HOSTS, publishUrlProblem, type ContentPlatform, type Language, type PublishUrlProblem } from '@gabee/types';
import type { PublishLinks } from '@/lib/server/content-studio/publish-links';
import { api } from '../_components/api';
import { PLATFORM_LABEL, type Bi } from '../_components/format';
import { SaveBar, SettingsCard, useSave, type OnDirty } from './settings-card';

/** How to find each link, in the owner's words. */
const HOW_TO: Record<ContentPlatform, Bi> = {
  linkedin: {
    fr: 'Ouvrez votre page Gabee en tant qu’admin, cliquez sur « Créer un post », copiez l’adresse.',
    en: 'Open your Gabee page as an admin, click “Create a post”, copy the address.',
  },
  tiktok: {
    fr: 'La page d’envoi de TikTok Studio ; TikTok ne permet pas de pré-remplir la légende.',
    en: 'TikTok Studio’s upload page; TikTok does not let the caption be filled in ahead.',
  },
};

function problemText(platform: ContentPlatform, problem: PublishUrlProblem, lang: Language): string {
  const host = PUBLISH_URL_HOSTS[platform].at(-1)!;
  const L = lang === 'fr';
  switch (problem) {
    case 'not_url':
      return L ? 'Collez l’adresse complète, qui commence par https://.' : 'Paste the full address, starting with https://.';
    case 'not_https':
      return L ? 'L’adresse doit commencer par https://.' : 'The address must start with https://.';
    case 'wrong_host':
      return L ? `L’adresse doit ouvrir ${host}.` : `The address must open ${host}.`;
    case 'too_long':
      return L ? 'Adresse trop longue (500 caractères au plus).' : 'Address too long (500 characters at most).';
  }
}

/**
 * « Liens de publication »: the page each « Copier et ouvrir » button of
 * Aujourd'hui opens. Super-admin edits; admins read. An empty field means no
 * link (the card then says to add one here).
 */
export function PublishLinksCard({
  lang,
  readOnly,
  onDirty,
  links,
  onSaved,
}: {
  lang: Language;
  readOnly: boolean;
  onDirty: OnDirty;
  links: PublishLinks;
  onSaved: (links: PublishLinks) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [values, setValues] = useState<Record<ContentPlatform, string>>(() => ({ linkedin: links.linkedin ?? '', tiktok: links.tiktok ?? '' }));
  const [touched, setTouched] = useState(false);
  const { state, run, touch } = useSave(lang);

  const changed = CONTENT_PLATFORMS.filter((p) => values[p].trim() !== (links[p] ?? ''));
  const problems = Object.fromEntries(
    CONTENT_PLATFORMS.map((p) => {
      const v = values[p].trim();
      const problem = v ? publishUrlProblem(p, v) : null;
      return [p, problem ? problemText(p, problem, lang) : null];
    }),
  ) as Record<ContentPlatform, string | null>;
  const dirty = changed.length > 0;
  const valid = CONTENT_PLATFORMS.every((p) => !problems[p]);
  useEffect(() => onDirty('publish-links', dirty), [dirty, onDirty]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !dirty) return;
    void run('publish-links', async () => {
      const body = Object.fromEntries(changed.map((p) => [p, values[p].trim() || null]));
      const res = await api<{ publish_links: PublishLinks }>('/settings/publish-links', { method: 'PATCH', body });
      onSaved(res.publish_links);
      setValues({ linkedin: res.publish_links.linkedin ?? '', tiktok: res.publish_links.tiktok ?? '' });
      setTouched(false);
    });
  };

  return (
    <SettingsCard
      title={t('Liens de publication', 'Publish links')}
      sub={t(
        'Sur Aujourd’hui, « Copier et ouvrir » copie le post puis ouvre cette page : il ne reste qu’à coller. Adresses https:// de LinkedIn ou de TikTok uniquement.',
        'On Today, “Copy and open” copies the post, then opens this page: all that is left is to paste. https:// addresses on LinkedIn or TikTok only.',
      )}
      readOnly={readOnly}
      footer={<SaveBar lang={lang} state={state} label={t('Enregistrer les liens', 'Save the links')} dirty={dirty} form={`${id}-form`} />}
    >
      <form id={`${id}-form`} className="col gap16" onSubmit={save} onChange={() => touch()} noValidate>
        {CONTENT_PLATFORMS.map((p) => {
          const showProblem = (touched || values[p].trim() !== '') && problems[p];
          return (
            <div key={p}>
              <label className="field-label" htmlFor={`${id}-${p}`}>
                {p === 'linkedin' ? t('Page LinkedIn (créer un post)', 'LinkedIn page (create a post)') : t('TikTok (envoyer une vidéo)', 'TikTok (upload a video)')}
              </label>
              <input
                id={`${id}-${p}`}
                className="inp"
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={readOnly ? undefined : `https://${PUBLISH_URL_HOSTS[p].at(-1)}/…`}
                value={values[p]}
                onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
                readOnly={readOnly}
                aria-invalid={!!showProblem}
                aria-describedby={`${id}-${p}-help`}
              />
              <p id={`${id}-${p}-help`} className={showProblem ? 'studio-field-error' : 'help'}>
                {showProblem
                  ? problems[p]
                  : `${HOW_TO[p][lang]}${values[p].trim() === '' ? t(` Sans lien, la carte ${PLATFORM_LABEL[p]} renvoie ici.`, ` Without a link, the ${PLATFORM_LABEL[p]} card points here.`) : ''}`}
              </p>
            </div>
          );
        })}
      </form>
    </SettingsCard>
  );
}
