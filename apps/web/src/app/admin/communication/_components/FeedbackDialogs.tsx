'use client';

import { useId, useState } from 'react';
import { FEEDBACK_NOTE_MAX, REGENERATE_INSTRUCTION_MAX, type Language } from '@gabee/types';
import { api, reportUnexpected } from './api';
import { Dialog } from './Dialog';
import { errorText } from './errors';

/**
 * The owner's feedback to the agents, outside the direction cards:
 * « Commenter » (a note kept for the agent's next runs) and « Régénérer avec
 * une consigne » (an instruction for one regeneration, kept as a note too).
 */

/** « Commenter » a day title or a draft: a note to the agent, saved here. `media`: a draft, whose note may be on its media. */
export function NoteDialog({
  title,
  intro,
  path,
  media = false,
  lang,
  onClose,
  onSaved,
}: {
  title: string;
  intro: string;
  /** The feedback route, e.g. `/drafts/<id>/feedback`. */
  path: string;
  media?: boolean;
  lang: Language;
  onClose: () => void;
  onSaved: () => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [note, setNote] = useState('');
  const [about, setAbout] = useState<'text' | 'media'>('text');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'POST', body: { note: note.trim(), ...(media ? { about } : {}) } });
      onSaved();
    } catch (err) {
      reportUnexpected(err, { action: 'feedback-note', path });
      setError(errorText(err, lang));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={title}
      lang={lang}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            {t('Annuler', 'Cancel')}
          </button>
          <button
            type="submit"
            form={id}
            className="btn studio-primary"
            disabled={busy || !note.trim()}
          >
            {busy
              ? t('Enregistrement…', 'Saving…')
              : t('Enregistrer le commentaire', 'Save the comment')}
          </button>
        </>
      }
    >
      <form id={id} onSubmit={submit} className="col gap12">
        <p className="studio-dialog-text">{intro}</p>
        {media && (
          <fieldset className="studio-platform-pick">
            <legend className="field-label">
              {t('Votre commentaire porte sur', 'Your comment is about')}
            </legend>
            {(['text', 'media'] as const).map((a) => (
              <label key={a} className="studio-check">
                <input
                  type="radio"
                  name={`${id}-about`}
                  value={a}
                  checked={about === a}
                  onChange={() => setAbout(a)}
                  disabled={busy}
                />
                {a === 'text' ? t('Le texte', 'The text') : t('Le média', 'The media')}
              </label>
            ))}
          </fieldset>
        )}
        <div>
          <label className="field-label" htmlFor={`${id}-note`}>
            {t('Votre commentaire', 'Your comment')}
          </label>
          <textarea
            id={`${id}-note`}
            className="ta"
            rows={3}
            maxLength={FEEDBACK_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            placeholder={t(
              'Ex. : trop long, ton trop vendeur, j’aime les questions en ouverture…',
              'E.g. too long, too salesy, I like opening with a question…',
            )}
            data-autofocus
          />
        </div>
        {error && (
          <p className="studio-field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/**
 * « Régénérer avec une consigne »: asks for the instruction, then hands it to
 * the caller, which runs the regeneration (and shows its progress) as for
 * « Régénérer ». `warning`: what the regeneration replaces, when it matters.
 */
export function InstructionDialog({
  title,
  warning,
  lang,
  onClose,
  onConfirm,
}: {
  title: string;
  warning?: string;
  lang: Language;
  onClose: () => void;
  onConfirm: (instruction: string) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [text, setText] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) onConfirm(text.trim());
  };
  return (
    <Dialog
      title={title}
      lang={lang}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            {t('Annuler', 'Cancel')}
          </button>
          <button type="submit" form={id} className="btn studio-primary" disabled={!text.trim()}>
            {t('Régénérer avec cette consigne', 'Regenerate with this instruction')}
          </button>
        </>
      }
    >
      <form id={id} onSubmit={submit} className="col gap12">
        {warning && <p className="studio-dialog-text">{warning}</p>}
        <div>
          <label className="field-label" htmlFor={`${id}-instruction`}>
            {t('Votre consigne pour Gabee', 'Your instruction for Gabee')}
          </label>
          <textarea
            id={`${id}-instruction`}
            className="ta"
            rows={3}
            maxLength={REGENERATE_INSTRUCTION_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={`${id}-help`}
            placeholder={t(
              'Ex. : plus court, sans emoji, parler du marché…',
              'E.g. shorter, no emoji, talk about the market…',
            )}
            data-autofocus
          />
          <p id={`${id}-help`} className="help">
            {t(
              'Gabee suit cette consigne pour cette régénération et la garde en mémoire pour les suivantes.',
              'Gabee follows this instruction for this regeneration and keeps it in mind for the next ones.',
            )}
          </p>
        </div>
      </form>
    </Dialog>
  );
}
