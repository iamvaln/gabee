'use client';

import { useState } from 'react';
import type { Language } from '@gabee/types';
import type { DraftDto } from '@/lib/server/content-studio/drafts';
import { api, notifyStudioChanged, reportUnexpected } from './api';
import { Dialog } from './Dialog';
import { errorText } from './errors';

const NOTE_MAX = 200;

/** The option's label, per platform (a TikTok post is a video; LinkedIn takes an image or a video). */
export function ownMediaLabel(platform: DraftDto['platform'], lang: Language): string {
  if (platform === 'tiktok') return lang === 'fr' ? 'J’utilise ma propre vidéo' : 'I use my own video';
  return lang === 'fr' ? 'J’utilise mon propre média (image ou vidéo)' : 'I use my own media (image or video)';
}

/** Turn the draft's own media on or off (PUT external-media). Throws `ApiError`. */
export async function saveOwnMedia(draftId: string, enabled: boolean, note?: string): Promise<DraftDto> {
  const res = await api<{ draft: DraftDto }>(`/drafts/${draftId}/external-media`, { method: 'PUT', body: { enabled, ...(enabled ? { note: note?.trim() || null } : {}) } });
  notifyStudioChanged();
  return res.draft;
}

/**
 * « J'utilise ma propre vidéo / mon propre média »: the owner posts with a
 * file that is not in the Médiathèque, with an optional note (its name, where
 * it is). A TikTok post can then be approved without a library video.
 */
export function ExternalMediaDialog({
  draft,
  lang,
  onClose,
  onSaved,
}: {
  draft: DraftDto;
  lang: Language;
  onClose: () => void;
  onSaved: (draft: DraftDto) => void;
}) {
  const L = lang === 'fr';
  const isTikTok = draft.platform === 'tiktok';
  const [note, setNote] = useState(draft.external_media?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = `own-media-${draft.id}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveOwnMedia(draft.id, true, note));
    } catch (err) {
      reportUnexpected(err, { action: 'own-media', draftId: draft.id });
      setError(errorText(err, lang));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={ownMediaLabel(draft.platform, lang)}
      lang={lang}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            {L ? 'Annuler' : 'Cancel'}
          </button>
          <button type="submit" form={formId} className="btn" disabled={busy}>
            {busy ? (L ? 'Enregistrement…' : 'Saving…') : isTikTok ? (L ? 'Utiliser ma vidéo' : 'Use my video') : L ? 'Utiliser mon média' : 'Use my media'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="col gap16" noValidate>
        <p className="studio-dialog-text">
          {isTikTok
            ? L
              ? 'Vous publiez avec une vidéo qui n’est pas dans la Médiathèque. Vous pourrez valider ce post sans y joindre de vidéo.'
              : 'You post with a video that is not in the Media library. You can approve this post without attaching a video.'
            : L
              ? 'Vous publiez avec une image ou une vidéo qui n’est pas dans la Médiathèque.'
              : 'You post with an image or a video that is not in the Media library.'}
          {draft.media &&
            (L ? ` Le fichier joint (${draft.media.file_name}) sera retiré de ce post.` : ` The attached file (${draft.media.file_name}) will be removed from this post.`)}
        </p>
        <div>
          <label className="field-label" htmlFor={`${formId}-note`}>
            {L ? 'Nom du fichier ou note (facultatif)' : 'File name or note (optional)'}
            <span className="studio-count">
              {note.length} / {NOTE_MAX}
            </span>
          </label>
          <input
            id={`${formId}-note`}
            className="inp"
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isTikTok ? (L ? 'ex. : tournage-cuisine.mp4, sur mon téléphone' : 'e.g. kitchen-shoot.mp4, on my phone') : L ? 'ex. : photo-atelier.jpg' : 'e.g. workshop-photo.jpg'}
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
