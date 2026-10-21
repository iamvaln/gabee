'use client';

import { useId } from 'react';
import type { Language } from '@gabee/types';
import type { Bi } from '../_components/format';
import { EDITED, obj, str, type Facts, type FactsForm } from './product-facts';

const KEPT_LABEL: Record<string, Bi> = {
  modules: { fr: 'Modules', en: 'Modules' },
  languages: { fr: 'Langues', en: 'Languages' },
  language_choice: { fr: 'Choix de la langue', en: 'Language choice' },
};

function keptValue(key: string, value: unknown, lang: Language): string {
  if (key === 'modules' && Array.isArray(value)) {
    return value
      .map((m) => {
        const o = obj(m);
        return o ? str(lang === 'fr' ? o.name_fr : o.name_en) || str(o.name) || str(o.key) : str(m);
      })
      .filter(Boolean)
      .join(', ');
  }
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ');
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * The editorial line's "product facts" (the only Gabee facts the agents may
 * state) as a small form instead of raw JSON: ages, the free tier, the paid
 * offer and the other facts. Keys the form does not edit (modules,
 * languages…) are kept as they are and listed read-only.
 */
export function ProductFactsForm({
  lang,
  value,
  onChange,
  errors,
  readOnly,
  original,
}: {
  lang: Language;
  value: FactsForm;
  onChange: (f: FactsForm) => void;
  errors: Record<string, string | null>;
  readOnly: boolean;
  original: Facts;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const set = (patch: Partial<FactsForm>) => onChange({ ...value, ...patch });
  const kept = Object.entries(original).filter(([k]) => !EDITED.has(k));

  return (
    <fieldset className="studio-fieldset studio-facts">
      <legend className="studio-facts-legend">{t('Faits produit', 'Product facts')}</legend>
      <p className="help studio-facts-help">
        {t(
          'Les seuls faits sur Gabee que les agents peuvent affirmer. Un fait absent n’est jamais mentionné.',
          'The only facts about Gabee the agents may state. A missing fact is never mentioned.',
        )}
      </p>

      <div className="studio-facts-group">
        <p className="section-label">{t('Âge des enfants', 'Children’s age')}</p>
        <div className="studio-form-row">
          <div>
            <label className="field-label" htmlFor={`${id}-min`}>
              {t('De (ans)', 'From (years)')}
            </label>
            <input id={`${id}-min`} className="inp" inputMode="numeric" value={value.ageMin} onChange={(e) => set({ ageMin: e.target.value })} aria-invalid={!!errors.ages} />
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-max`}>
              {t('À (ans)', 'To (years)')}
            </label>
            <input id={`${id}-max`} className="inp" inputMode="numeric" value={value.ageMax} onChange={(e) => set({ ageMax: e.target.value })} aria-invalid={!!errors.ages} />
          </div>
        </div>
        {errors.ages && <p className="studio-field-error">{errors.ages}</p>}
      </div>

      <div className="studio-facts-group">
        <p className="section-label">{t('Offre gratuite', 'Free tier')}</p>
        <div className="studio-form-row">
          <div>
            <label className="field-label" htmlFor={`${id}-fprice`}>
              {t('Prix de l’offre gratuite', 'Free tier price')}
            </label>
            <input id={`${id}-fprice`} className="inp" value={value.freePrice} onChange={(e) => set({ freePrice: e.target.value })} placeholder="0 FCFA" />
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-fkids`}>
              {t('Enfants inclus (au plus)', 'Children included (at most)')}
            </label>
            <input id={`${id}-fkids`} className="inp" inputMode="numeric" value={value.freeChildren} onChange={(e) => set({ freeChildren: e.target.value })} aria-invalid={!!errors.freeChildren} />
          </div>
        </div>
        {errors.freeChildren && <p className="studio-field-error">{errors.freeChildren}</p>}
      </div>

      <div className="studio-facts-group">
        <p className="section-label">{t('Offre payante', 'Paid offer')}</p>
        <label className="studio-check">
          <input type="checkbox" checked={value.paid} onChange={(e) => set({ paid: e.target.checked })} />
          {t('Une offre payante existe', 'A paid offer exists')}
        </label>
        {value.paid ? (
          <>
            <div className="studio-form-row">
              <div>
                <label className="field-label" htmlFor={`${id}-pname`}>
                  {t('Nom de l’offre', 'Offer name')}
                </label>
                <input id={`${id}-pname`} className="inp" value={value.paidName} onChange={(e) => set({ paidName: e.target.value })} maxLength={80} aria-invalid={!!errors.paid && !value.paidName.trim()} />
              </div>
              <div>
                <label className="field-label" htmlFor={`${id}-pprice`}>
                  {t('Prix', 'Price')}
                </label>
                <input id={`${id}-pprice`} className="inp" value={value.paidPrice} onChange={(e) => set({ paidPrice: e.target.value })} placeholder={t('ex. 2 000 FCFA / mois', 'e.g. 2,000 FCFA / month')} maxLength={80} aria-invalid={!!errors.paid && !value.paidPrice.trim()} />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor={`${id}-pinc`}>
                {t('Ce qu’elle comprend (une ligne par point)', 'What it includes (one line per item)')}
              </label>
              <textarea id={`${id}-pinc`} className="ta" rows={3} value={value.paidIncludes} onChange={(e) => set({ paidIncludes: e.target.value })} />
            </div>
            {errors.paid && <p className="studio-field-error">{errors.paid}</p>}
          </>
        ) : (
          !readOnly && <p className="help">{t('Tant qu’elle n’existe pas, les agents n’en parlent jamais.', 'Until it exists, the agents never mention one.')}</p>
        )}
      </div>

      <div className="studio-facts-group">
        <label className="field-label" htmlFor={`${id}-other`}>
          {t('Autres faits (un par ligne)', 'Other facts (one per line)')}
        </label>
        <textarea id={`${id}-other`} className="ta" rows={5} value={value.otherFacts} onChange={(e) => set({ otherFacts: e.target.value })} />
      </div>

      {kept.length > 0 && (
        <div className="studio-facts-group">
          <p className="section-label">{t('Aussi transmis aux agents, sans changement', 'Also given to the agents, unchanged')}</p>
          <dl className="kv studio-kept">
            {kept.map(([k, v]) => (
              <div key={k} className="studio-kept-row">
                <dt>{KEPT_LABEL[k]?.[lang] ?? k}</dt>
                <dd>{keptValue(k, v, lang)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </fieldset>
  );
}
