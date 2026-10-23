'use client';

import { useState } from 'react';
import type { Language, TikTokPost } from '@gabee/types';
import type { DraftDto } from '@/lib/server/content-studio/drafts';
import { AIcon } from '../../_shell/icons';
import { API } from './api';
import { postText } from './format';

const TOKEN_RE = /(https?:\/\/\S+|#[\p{L}\p{N}_]+)/gu;

/** Post text with links and hashtags highlighted (not clickable: a click would count as a visit). */
function RichText({ text }: { text: string }) {
  const parts = text.split(TOKEN_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className={part.startsWith('#') ? 'studio-tag' : 'studio-link'}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** How a draft will look once posted (LinkedIn post, or TikTok caption + plan), with its attached media. */
export function Preview({ draft, lang }: { draft: DraftDto; lang: Language }) {
  const L = lang === 'fr';
  if (draft.platform === 'linkedin') {
    return (
      <div className="studio-preview li">
        <div className="studio-li-author" aria-hidden>
          <span className="studio-li-avatar">G</span>
          <span>
            <b>Gabee</b>
            <small>{L ? 'Aperçu du post' : 'Post preview'}</small>
          </span>
        </div>
        <p className="studio-post-text">
          <RichText text={postText(draft)} />
        </p>
        {draft.media && <MediaThumb draft={draft} lang={lang} />}
      </div>
    );
  }
  const p = draft.payload as TikTokPost;
  const plan = p.mode === 'filming_plan' && p.filming_plan ? p.filming_plan : null;
  return (
    <div className="studio-preview tt">
      <div className="studio-tt-visual">
        {draft.media?.kind === 'video' ? (
          <MediaThumb draft={draft} lang={lang} />
        ) : (
          <div className="studio-tt-frame is-empty">
            <AIcon name="device" size={26} />
            <span>{L ? 'Vidéo à filmer' : 'Video to film'}</span>
          </div>
        )}
      </div>
      <div className="studio-tt-text">
        <span className={`badge ${plan ? 'warn' : 'info'}`}>
          <i className="bdot" />
          {plan ? (L ? 'À filmer' : 'To film') : L ? 'Vidéo de la médiathèque' : 'Library video'}
        </span>
        <div>
          <p className="section-label">{L ? 'Légende' : 'Caption'}</p>
          <p className="studio-post-text">
            <RichText text={postText(draft)} />
          </p>
        </div>
        {p.on_screen_text.length > 0 && (
          <div>
            <p className="section-label">{L ? 'Texte à l’écran' : 'On-screen text'}</p>
            <ol className="studio-list">
              {p.on_screen_text.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </div>
        )}
        {plan && (
          <section className="studio-plan" aria-label={L ? 'Plan de tournage' : 'Filming plan'}>
            <h4>
              <AIcon name="play" size={14} />
              {L ? 'Plan de tournage' : 'Filming plan'}
              <span className="studio-plan-dur">≈ {Math.round(plan.duration_s)} s</span>
            </h4>
            <p className="studio-plan-hook">
              <span>{L ? 'Accroche (3 premières secondes)' : 'Hook (first 3 seconds)'}</span>
              {plan.hook}
            </p>
            <ol className="studio-list">
              {plan.shots.map((shot, i) => (
                <li key={i}>{shot}</li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * The attached media. Images load through the draft's media route (a
 * short-lived presigned URL); a video shows as a tile, so opening the screen
 * never pulls a large file. Any load failure falls back to the tile.
 */
function MediaThumb({ draft, lang }: { draft: DraftDto; lang: Language }) {
  const [failed, setFailed] = useState(false);
  const m = draft.media!;
  const L = lang === 'fr';
  if (m.kind === 'image' && !failed) {
    // Plain <img>: a private, short-lived presigned URL that next/image cannot optimise.
    return <img className="studio-media-img" src={`${API}/drafts/${draft.id}/media`} alt={m.file_name} loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <div className={'studio-media-tile' + (draft.platform === 'tiktok' ? ' studio-tt-frame' : '')}>
      <AIcon name={m.kind === 'video' ? 'play' : 'eye'} size={22} />
      <span className="studio-media-name">{m.file_name}</span>
      <span className="studio-media-meta">
        {m.kind === 'video' ? (L ? 'Vidéo' : 'Video') : L ? 'Image' : 'Image'}
        {m.aspect ? ` · ${m.aspect}` : ''}
      </span>
    </div>
  );
}
