'use client';

import { useId, useState } from 'react';
import { CONTENT_PLATFORMS, type ChooseDirectionRequest, type ContentPlatform, type Language } from '@gabee/types';
import type { WeekDto } from '@/lib/server/content-studio/weeks';
import { AIcon } from '../../_shell/icons';
import { PLATFORM_LABEL } from './format';

/**
 * Step 1 of the Semaine screen: the Strategist's 3 directions as a radio
 * group, a free-text precision and optional per-platform angles, then
 * "Arrêter cette direction" (the titles run, done by the caller).
 */
export function DirectionCards({
  week,
  lang,
  busy,
  onSubmit,
  onCancel,
}: {
  week: WeekDto;
  lang: Language;
  busy: boolean;
  onSubmit: (req: ChooseDirectionRequest) => void;
  /** Back to the current titles (when changing an already chosen direction). */
  onCancel?: () => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const proposals = week.proposals ?? [];
  const [chosen, setChosen] = useState<number | null>(week.chosen_index);
  const [refinement, setRefinement] = useState(week.refinement ?? '');
  const [angles, setAngles] = useState<Partial<Record<ContentPlatform, string>>>(week.platform_angles);
  // Opened once if the week already has angles; afterwards the owner opens/closes it (typing never collapses it).
  const [anglesOpen] = useState(() => Object.values(week.platform_angles).some((v) => v && v.trim()));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (chosen === null || busy) return;
    const platform_angles = Object.fromEntries(
      Object.entries(angles).flatMap(([k, v]) => (v && v.trim() ? [[k, v.trim()]] : [])),
    ) as ChooseDirectionRequest['platform_angles'];
    onSubmit({ proposal_index: chosen as 0 | 1 | 2, refinement: refinement.trim(), platform_angles });
  }

  return (
    <form onSubmit={submit} className="col gap16">
      <fieldset className="studio-directions" disabled={busy}>
        <legend className="studio-section-title">{t('Choisissez la direction de la semaine', "Pick the week's direction")}</legend>
        <div className="studio-direction-grid">
          {proposals.map((p, i) => (
            <label key={i} className={'card studio-direction' + (chosen === i ? ' on' : '')}>
              <span className="studio-direction-top">
                <span className="studio-direction-n">Direction {i + 1}</span>
                <input
                  type="radio"
                  className="studio-radio"
                  name={`${id}-direction`}
                  value={i}
                  checked={chosen === i}
                  onChange={() => setChosen(i)}
                  aria-labelledby={`${id}-title-${i}`}
                />
              </span>
              <span className="studio-direction-title" id={`${id}-title-${i}`}>
                {p.title}
              </span>
              <span className="studio-direction-why">{p.rationale}</span>
              {p.evidence.length > 0 && (
                <span className="studio-direction-block">
                  <span className="section-label">{t('Ce qui la motive', 'Why')}</span>
                  <ul className="studio-list">
                    {p.evidence.map((e, j) => (
                      <li key={j}>{e}</li>
                    ))}
                  </ul>
                </span>
              )}
              {p.sample_angles.length > 0 && (
                <span className="studio-direction-block">
                  <span className="section-label">{t('Exemples d’angles', 'Sample angles')}</span>
                  <ul className="studio-list">
                    {p.sample_angles.map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ul>
                </span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="card card-pad col gap16">
        <div>
          <label className="field-label" htmlFor={`${id}-refine`}>
            {t('Votre précision (facultatif)', 'Your note (optional)')}
          </label>
          <textarea
            id={`${id}-refine`}
            className="ta"
            rows={3}
            maxLength={2000}
            value={refinement}
            onChange={(e) => setRefinement(e.target.value)}
            disabled={busy}
            placeholder={t(
              'Ex. : insister sur les parents qui travaillent, éviter le mot « écran »…',
              'E.g. focus on working parents, avoid the word "screen"…',
            )}
          />
          <p className="help">{t('Gabee en tient compte pour écrire le titre de chaque jour.', "Gabee uses it to write each day's title.")}</p>
        </div>
        <details className="studio-details" open={anglesOpen || undefined}>
          <summary>{t('Angle par plateforme (facultatif)', 'Angle per platform (optional)')}</summary>
          <div className="studio-angle-grid">
            {CONTENT_PLATFORMS.map((p) => (
              <div key={p}>
                <label className="field-label" htmlFor={`${id}-angle-${p}`}>
                  {t(`Angle ${PLATFORM_LABEL[p]}`, `${PLATFORM_LABEL[p]} angle`)}
                </label>
                <input
                  id={`${id}-angle-${p}`}
                  className="inp"
                  maxLength={500}
                  value={angles[p] ?? ''}
                  onChange={(e) => setAngles((a) => ({ ...a, [p]: e.target.value }))}
                  disabled={busy}
                  placeholder={p === 'linkedin' ? t('Ex. : témoignage de parent', 'E.g. a parent testimony') : t('Ex. : coulisses du jeu', 'E.g. behind the game')}
                />
              </div>
            ))}
          </div>
        </details>
      </div>

      <div className="studio-submit-row">
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>
            {t('Garder les titres actuels', 'Keep the current titles')}
          </button>
        )}
        <p className="hint">{t('Gabee écrit ensuite un titre par jour.', 'Gabee then writes one title per day.')}</p>
        <button type="submit" className="btn studio-primary" disabled={chosen === null || busy}>
          <AIcon name="check" />
          {t('Arrêter cette direction', 'Lock this direction')}
        </button>
      </div>
    </form>
  );
}
