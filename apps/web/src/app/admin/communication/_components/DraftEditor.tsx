'use client';

import { useId, useState } from 'react';
import type { Language, LinkedInPost, TikTokPost } from '@gabee/types';
import type { DraftDto, MediaSummary } from '@/lib/server/content-studio/drafts';
import { AIcon } from '../../_shell/icons';
import { Notice } from './ErrorNotice';
import { kindLabel } from './media';
import { MediaPicker } from './MediaPicker';

/** The owner's edit of a draft: text (without the tracked link), hashtags and the attached media. */
export function DraftEditor({
  draft,
  lang,
  busy,
  pickFirst,
  onCancel,
  onSave,
}: {
  draft: DraftDto;
  lang: Language;
  busy: boolean;
  pickFirst: boolean;
  onCancel: () => void;
  onSave: (body: string, hashtags: string[], media: string | null | undefined) => void;
}) {
  const L = lang === 'fr';
  const isLi = draft.platform === 'linkedin';
  const p = draft.payload!;
  const url = draft.tracked_url;
  const initial = isLi ? stripLink((p as LinkedInPost).body, url) : (p as TikTokPost).caption;
  const [body, setBody] = useState(initial);
  const [tags, setTags] = useState(p.hashtags.join(' '));
  const [media, setMedia] = useState<MediaSummary | null>(draft.media);
  const [picking, setPicking] = useState(pickFirst);
  const id = useId();
  const mediaChanged = (media?.id ?? null) !== (draft.media?.id ?? null);
  const hashtags = tags
    .split(/\s+/)
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`));

  return (
    <form
      className="studio-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) onSave(body, hashtags, mediaChanged ? (media?.id ?? null) : undefined);
      }}
    >
      {draft.status === 'approved' && (
        <Notice tone="warn">{L ? 'Enregistrer une modification retire la validation de ce post.' : 'Saving an edit removes the approval of this post.'}</Notice>
      )}
      <div>
        <label className="field-label" htmlFor={`${id}-body`}>
          {isLi ? (L ? 'Texte du post' : 'Post text') : L ? 'Légende' : 'Caption'}
          <span className="studio-count">
            {body.length} {L ? 'caractères' : 'characters'}
          </span>
        </label>
        <textarea id={`${id}-body`} className="ta" rows={isLi ? 10 : 5} value={body} onChange={(e) => setBody(e.target.value)} data-autofocus autoFocus />
        {isLi && (
          <p className="help">
            {L ? 'Le lien suivi est ajouté automatiquement à la fin : ' : 'The tracked link is added at the end automatically: '}
            <span className="studio-link">{url}</span>
          </p>
        )}
      </div>
      <div>
        <label className="field-label" htmlFor={`${id}-tags`}>
          {L ? 'Hashtags (séparés par des espaces)' : 'Hashtags (separated by spaces)'}
        </label>
        <input id={`${id}-tags`} className="inp" value={tags} onChange={(e) => setTags(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </div>
      <div>
        <p className="field-label" id={`${id}-media`}>
          {isLi ? (L ? 'Média (facultatif)' : 'Media (optional)') : L ? 'Vidéo' : 'Video'}
        </p>
        <div className="studio-media-choice" aria-labelledby={`${id}-media`} role="group">
          {media ? (
            <span className="studio-media-chosen">
              <AIcon name={media.kind === 'video' ? 'play' : 'eye'} size={18} />
              <span className="studio-pick-text">
                <span className="studio-pick-name">{media.file_name}</span>
                <span className="studio-pick-meta">
                  {kindLabel(media.kind, lang)}
                  {media.aspect ? ` · ${media.aspect}` : ''}
                  {media.cleared ? '' : L ? ' · non autorisé' : ' · not cleared'}
                </span>
              </span>
            </span>
          ) : (
            <span className="studio-muted-text">{isLi ? (L ? 'Aucun : texte seul' : 'None: text only') : L ? 'Aucune vidéo jointe' : 'No video attached'}</span>
          )}
          <span className="studio-media-choice-actions">
            <button type="button" className="btn secondary sm" onClick={() => setPicking(true)} disabled={busy}>
              {media ? (L ? 'Changer de média' : 'Change media') : L ? 'Choisir un média' : 'Choose media'}
            </button>
            {media && (
              <button type="button" className="btn ghost sm" onClick={() => setMedia(null)} disabled={busy}>
                {L ? 'Retirer' : 'Remove'}
              </button>
            )}
          </span>
        </div>
      </div>
      {picking && (
        <MediaPicker
          platform={draft.platform}
          lang={lang}
          currentId={media?.id ?? null}
          onClose={() => setPicking(false)}
          onPick={(a) => {
            setMedia({ id: a.id, kind: a.kind, file_name: a.fileName, cleared: a.cleared, aspect: a.aspect });
            setPicking(false);
          }}
        />
      )}
      <div className="studio-actions">
        <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>
          {L ? 'Annuler' : 'Cancel'}
        </button>
        <button type="submit" className="btn studio-primary" disabled={busy || !body.trim()}>
          {busy ? (L ? 'Enregistrement…' : 'Saving…') : L ? 'Enregistrer' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function stripLink(text: string, url: string): string {
  const trimmed = text.trimEnd();
  return trimmed.endsWith(url) ? trimmed.slice(0, -url.length).trimEnd() : trimmed;
}
