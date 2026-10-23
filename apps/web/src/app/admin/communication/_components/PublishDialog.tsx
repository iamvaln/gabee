'use client';

import { useState } from 'react';
import type { Language } from '@gabee/types';
import type { DraftDto } from '@/lib/server/content-studio/drafts';
import { api, notifyStudioChanged, reportUnexpected } from './api';
import { Dialog } from './Dialog';
import { errorText } from './errors';
import { PLATFORM_LABEL } from './format';

const STARS = [1, 2, 3, 4, 5] as const;

function isPostUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * "Marquer comme publié": the post's URL (required), an optional 1–5 rating
 * and comment. These feed next week's Strategist, so the copy says so.
 */
export function PublishDialog({
  draft,
  lang,
  onClose,
  onPublished,
}: {
  draft: DraftDto;
  lang: Language;
  onClose: () => void;
  onPublished: (draft: DraftDto) => void;
}) {
  const L = lang === 'fr';
  const [url, setUrl] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const urlOk = isPostUrl(url);
  const platform = PLATFORM_LABEL[draft.platform];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!urlOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ draft: DraftDto }>(`/drafts/${draft.id}/publish`, {
        method: 'POST',
        body: { post_url: url.trim(), ...(rating ? { rating } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) },
      });
      notifyStudioChanged();
      onPublished(res.draft);
    } catch (err) {
      reportUnexpected(err, { action: 'publish', draftId: draft.id });
      setError(
        errorText(err, lang, {
          validation_error: {
            fr: "Le lien n'est pas valide. Collez l'adresse complète du post (elle commence par https://).",
            en: 'The link is not valid. Paste the full address of the post (it starts with https://).',
          },
        }),
      );
      setBusy(false);
    }
  }

  const formId = `publish-${draft.id}`;
  return (
    <Dialog
      title={L ? 'Marquer comme publié' : 'Mark as published'}
      lang={lang}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            {L ? 'Annuler' : 'Cancel'}
          </button>
          <button type="submit" form={formId} className="btn" disabled={busy}>
            {busy ? (L ? 'Enregistrement…' : 'Saving…') : L ? 'Enregistrer la publication' : 'Save publication'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="col gap16" noValidate>
        <p className="studio-dialog-text">
          {L
            ? `Collez le lien du post ${platform} une fois publié. La note et le commentaire aident Gabee à préparer la semaine suivante.`
            : `Paste the link to the ${platform} post once it is live. The rating and comment help Gabee plan next week.`}
        </p>
        <div>
          <label className="field-label" htmlFor={`${formId}-url`}>
            {L ? 'Lien du post publié' : 'Link to the published post'}
          </label>
          <input
            id={`${formId}-url`}
            className="inp"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouched(url.trim() !== '')}
            aria-invalid={touched && !urlOk}
            aria-describedby={touched && !urlOk ? `${formId}-url-err` : undefined}
            required
            data-autofocus
          />
          {touched && !urlOk && (
            <p id={`${formId}-url-err`} className="studio-field-error">
              {L ? 'Collez l’adresse complète du post, qui commence par https://' : 'Paste the full address of the post, starting with https://'}
            </p>
          )}
        </div>
        <fieldset className="studio-stars">
          <legend className="field-label">{L ? 'Note (facultatif)' : 'Rating (optional)'}</legend>
          <div className="studio-stars-row">
            {STARS.map((n) => (
              <label key={n} className={'studio-star' + (rating !== null && n <= rating ? ' on' : '')}>
                <input
                  type="radio"
                  name={`${formId}-rating`}
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  aria-label={L ? `${n} étoile${n > 1 ? 's' : ''}` : `${n} star${n > 1 ? 's' : ''}`}
                />
                <span aria-hidden>★</span>
              </label>
            ))}
            {rating !== null && (
              <button type="button" className="btn ghost sm" onClick={() => setRating(null)}>
                {L ? 'Effacer' : 'Clear'}
              </button>
            )}
          </div>
        </fieldset>
        <div>
          <label className="field-label" htmlFor={`${formId}-comment`}>
            {L ? 'Commentaire (facultatif)' : 'Comment (optional)'}
          </label>
          <textarea
            id={`${formId}-comment`}
            className="ta"
            rows={3}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={L ? 'Ex. : beaucoup de partages, peu de clics.' : 'E.g. many shares, few clicks.'}
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
