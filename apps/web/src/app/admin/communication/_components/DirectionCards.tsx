'use client';

import { useId, useRef, useState } from 'react';
import {
  CONTENT_PLATFORMS,
  FEEDBACK_NOTE_MAX,
  type ChooseDirectionRequest,
  type ContentPlatform,
  type FeedbackSentiment,
  type Language,
} from '@gabee/types';
import type { DirectionFeedbackDto } from '@/lib/server/content-studio/feedback';
import type { WeekDto } from '@/lib/server/content-studio/weeks';
import { AIcon } from '../../_shell/icons';
import { api, reportUnexpected } from './api';
import { errorText } from './errors';
import { PLATFORM_LABEL } from './format';

/**
 * Step 1 of the Semaine screen: the Strategist's 3 directions as a radio
 * group, a free-text precision and optional per-platform angles, then
 * "Arrêter cette direction" (the titles run, done by the caller). Each card
 * takes the owner's 👍/👎 and a word, saved at once for the Strategist.
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
            <div key={i} className={'card studio-direction' + (chosen === i ? ' on' : '')}>
              <label className="studio-direction-pick">
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
              <DirectionFeedback
                weekId={week.id}
                index={i}
                title={p.title}
                initial={week.direction_feedback.find((f) => f.proposal_index === i) ?? null}
                lang={lang}
                disabled={busy}
              />
            </div>
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

type Saved = { sentiment: FeedbackSentiment | null; note: string };

/**
 * 👍 « Ça me plaît » / 👎 « Pas pour nous » and « Ajouter un mot » on one
 * direction: each change is saved at once (the card's whole feedback, in
 * order), and the Strategist reads it at its next runs — including
 * « Régénérer les propositions ».
 */
function DirectionFeedback({
  weekId,
  index,
  title,
  initial,
  lang,
  disabled,
}: {
  weekId: string;
  index: number;
  title: string;
  initial: DirectionFeedbackDto | null;
  lang: Language;
  disabled: boolean;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [sentiment, setSentiment] = useState<FeedbackSentiment | null>(initial?.sentiment ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [noteOpen, setNoteOpen] = useState(!!initial?.note);
  const [status, setStatus] = useState<null | 'saving' | 'saved'>(null);
  const [error, setError] = useState<string | null>(null);
  const start: Saved = { sentiment: initial?.sentiment ?? null, note: initial?.note ?? '' };
  /** What the server holds: a failed save goes back to it. */
  const saved = useRef<Saved>(start);
  /** The last state sent: the same change (a blur, then the button) is sent once. */
  const sent = useRef<Saved>(start);
  const [savedNote, setSavedNote] = useState(start.note);
  /** Saves run one after the other, so the last change is the one kept. */
  const queue = useRef<Promise<void>>(Promise.resolve());

  const save = (change: Saved) => {
    const next = { sentiment: change.sentiment, note: change.note.trim() };
    if (next.sentiment === sent.current.sentiment && next.note === sent.current.note) return;
    sent.current = next;
    setStatus('saving');
    setError(null);
    queue.current = queue.current.then(async () => {
      try {
        await api(`/weeks/${weekId}/feedback`, {
          method: 'POST',
          body: { proposal_index: index, sentiment: next.sentiment, note: next.note || null },
        });
        saved.current = next;
        setSavedNote(next.note);
        setStatus('saved');
      } catch (err) {
        reportUnexpected(err, { action: 'direction-feedback', weekId, index });
        setError(
          t(
            `Votre avis n’a pas été enregistré. ${errorText(err, lang)}`,
            `Your feedback was not saved. ${errorText(err, lang)}`,
          ),
        );
        sent.current = saved.current;
        setSentiment(saved.current.sentiment);
        setNote(saved.current.note);
        setStatus(null);
      }
    });
  };

  const toggle = (s: FeedbackSentiment) => {
    const next = sentiment === s ? null : s;
    setSentiment(next);
    save({ sentiment: next, note });
  };

  return (
    <div
      className="studio-feedback"
      role="group"
      aria-label={t(`Votre avis sur « ${title} »`, `Your feedback on “${title}”`)}
    >
      <div className="studio-feedback-row">
        <button
          type="button"
          className={'btn secondary sm studio-thumb' + (sentiment === 'up' ? ' on' : '')}
          aria-pressed={sentiment === 'up'}
          onClick={() => toggle('up')}
          disabled={disabled}
        >
          <span aria-hidden>👍</span>
          {t('Ça me plaît', 'I like it')}
        </button>
        <button
          type="button"
          className={'btn secondary sm studio-thumb' + (sentiment === 'down' ? ' on' : '')}
          aria-pressed={sentiment === 'down'}
          onClick={() => toggle('down')}
          disabled={disabled}
        >
          <span aria-hidden>👎</span>
          {t('Pas pour nous', 'Not for us')}
        </button>
        {!noteOpen && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setNoteOpen(true)}
            disabled={disabled}
          >
            <AIcon name="edit" size={14} />
            {t('Ajouter un mot', 'Add a word')}
          </button>
        )}
      </div>
      {noteOpen && (
        <div className="studio-feedback-note">
          <label className="field-label" htmlFor={`${id}-note`}>
            {t('Un mot pour Gabee (facultatif)', 'A word for Gabee (optional)')}
          </label>
          <textarea
            id={`${id}-note`}
            className="ta"
            rows={2}
            maxLength={FEEDBACK_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => save({ sentiment, note })}
            disabled={disabled}
            autoFocus={!initial?.note}
            placeholder={t(
              'Ex. : déjà fait le mois dernier, trop vendeur…',
              'E.g. done last month already, too salesy…',
            )}
          />
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => save({ sentiment, note })}
            disabled={disabled || note.trim() === savedNote}
          >
            {t('Enregistrer', 'Save')}
          </button>
        </div>
      )}
      <p className="studio-feedback-status" aria-live="polite">
        {status === 'saving'
          ? t('Enregistrement…', 'Saving…')
          : status === 'saved'
            ? t('Enregistré', 'Saved')
            : ''}
      </p>
      {error && (
        <p className="studio-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
