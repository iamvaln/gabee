'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { ContentLanguage, ContentPlatform, Language, LinkedInPost, TikTokPost } from '@gabee/types';
import type { DraftDto } from '@/lib/server/content-studio/drafts';
import { AIcon } from '../../_shell/icons';
import { API, ApiError, api, downloadDraftMedia, notifyStudioChanged, reportUnexpected } from './api';
import { copyText } from './copy';
import { ConfirmDialog } from './Dialog';
import { AiWorking, ErrorNotice, Notice } from './ErrorNotice';
import { errorText } from './errors';
import { DRAFT_STATUS, LANGUAGE_LABEL, PLATFORM_LABEL, dateTime, postText } from './format';
import { PublishDialog } from './PublishDialog';

const MEDIA_LIBRARY = '/admin/communication/medias';

type Busy = null | 'approve' | 'regenerate' | 'save' | 'download';

/** Draft card of the Aujourd'hui screen: preview, status, and the owner's actions on one platform's post. */
export function PostCard({ draft, lang, onChange }: { draft: DraftDto; lang: Language; onChange: (d: DraftDto) => void }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const titleId = useId();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ text: string; details?: string[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState<null | 'ok' | 'fail'>(null);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 3000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const platform = PLATFORM_LABEL[draft.platform];
  // `generating` with no live lock: the run died (crash, deploy) and nobody is writing it any more.
  const crashed = draft.status === 'generating' && !draft.generating && busy !== 'regenerate';
  const generating = busy === 'regenerate' || draft.generating;
  const hasText = draft.payload !== null;
  const media = draft.media;
  const isTikTok = draft.platform === 'tiktok';
  const videoOk = media !== null && media.kind === 'video' && media.cleared;
  const mediaOk = isTikTok ? videoOk : media === null || media.cleared;
  const status = generating ? 'generating' : crashed ? 'interrupted' : draft.status;
  const badge = DRAFT_STATUS[status] ?? { tone: 'neutral', label: { fr: status, en: status } };
  const locked = busy !== null || generating;

  async function run(kind: Exclude<Busy, null>, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      reportUnexpected(err, { action: kind, draftId: draft.id });
      const details = err instanceof ApiError && err.code === 'invalid_post' && Array.isArray(err.details) ? (err.details as string[]) : undefined;
      setError({ text: errorText(err, lang), details });
    } finally {
      setBusy(null);
    }
  }

  const approve = () =>
    run('approve', async () => {
      const res = await api<{ draft: DraftDto }>(`/drafts/${draft.id}/approve`, { method: 'POST' });
      onChange(res.draft);
      notifyStudioChanged();
    });

  const regenerate = () => {
    setConfirmRegen(false);
    setEditing(false);
    return run('regenerate', async () => {
      const res = await api<{ draft: DraftDto }>(`/drafts/${draft.id}/regenerate`, { method: 'POST' });
      onChange(res.draft);
      notifyStudioChanged();
    });
  };

  // Replacing an owner edit or an approval asks first (spec: destructive actions confirm).
  const askRegenerate = () => (draft.version?.source === 'owner' || draft.status === 'approved' ? setConfirmRegen(true) : void regenerate());

  const download = () => run('download', () => downloadDraftMedia(draft.id));

  async function copy() {
    // Straight from the tap: iOS only allows clipboard writes inside the gesture.
    setCopied((await copyText(postText(draft))) ? 'ok' : 'fail');
  }

  const save = (body: string, hashtags: string[]) =>
    run('save', async () => {
      const res = await api<{ draft: DraftDto }>(`/drafts/${draft.id}`, { method: 'PATCH', body: { body, hashtags } });
      onChange(res.draft);
      setEditing(false);
      notifyStudioChanged();
    });

  const canEdit = hasText && ['ready', 'approved', 'stale', 'failed'].includes(draft.status);
  const canRegenerate = ['ready', 'approved', 'stale'].includes(draft.status);
  const canApprove = hasText && ['ready', 'stale'].includes(draft.status);

  return (
    <article className={'card studio-post' + (draft.status === 'published' ? ' is-published' : '')} aria-labelledby={titleId}>
      <header className="studio-post-head">
        <PlatformMark platform={draft.platform} />
        <div className="col studio-post-title">
          <h3 id={titleId}>{platform}</h3>
          <span className="card-title-sub">
            {t('Post en ', 'Post in ')}
            {LANGUAGE_LABEL[draft.language][lang]}
            {draft.version && (
              <>
                {' · v'}
                {draft.version.n}
                {draft.version.source === 'owner' ? t(' · modifié par vous', ' · edited by you') : ''}
              </>
            )}
          </span>
        </div>
        <span className={`badge ${badge.tone}`}>
          <i className="bdot" />
          {badge.label[lang]}
        </span>
      </header>

      <div className="studio-post-body">
        {generating && <AiWorking lang={lang} title={t(`Gabee rédige le post ${platform}…`, `Gabee is writing the ${platform} post…`)} />}

        {crashed && (
          <ErrorNotice
            lang={lang}
            message={t(
              'La rédaction s’est interrompue. Relancez-la : rien n’est perdu.',
              'Writing this post was interrupted. Run it again: nothing is lost.',
            )}
            onRetry={regenerate}
            busy={locked}
          />
        )}

        {!generating && draft.status === 'failed' && (
          <ErrorNotice
            lang={lang}
            message={draft.error ?? t('La rédaction de ce post a échoué.', 'Writing this post failed.')}
            onRetry={regenerate}
            busy={locked}
          />
        )}

        {!generating && draft.status === 'stale' && (
          <Notice tone="warn">
            {t(
              'Le sujet du jour a changé depuis la rédaction de ce post. Régénérez-le, ou gardez-le tel quel et validez-le.',
              "The day's topic changed after this post was written. Regenerate it, or keep it as is and approve it.",
            )}
          </Notice>
        )}

        {editing && draft.payload ? (
          <DraftEditor draft={draft} lang={lang} busy={busy === 'save'} onCancel={() => setEditing(false)} onSave={save} />
        ) : (
          hasText && !generating && <Preview draft={draft} lang={lang} />
        )}

        {hasText && !generating && !crashed && draft.status !== 'published' && <MediaNotices draft={draft} lang={lang} />}

        {draft.publication && <PublicationSummary publication={draft.publication} lang={lang} />}

        {error && <ErrorNotice lang={lang} message={error.text} details={error.details} />}
      </div>

      {!editing && hasText && !crashed && (
        <div className="studio-actions" role="group" aria-label={t(`Actions sur le post ${platform}`, `${platform} post actions`)}>
          <button type="button" className="btn secondary" onClick={copy} disabled={generating}>
            <AIcon name={copied === 'ok' ? 'check' : 'copy'} />
            {t('Copier le texte', 'Copy text')}
          </button>
          {media?.cleared && (
            <button type="button" className="btn secondary" onClick={download} disabled={locked}>
              <AIcon name="download" />
              {busy === 'download' ? t('Préparation…', 'Preparing…') : t('Télécharger le média', 'Download media')}
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn secondary" onClick={() => setEditing(true)} disabled={locked}>
              <AIcon name="edit" />
              {t('Modifier', 'Edit')}
            </button>
          )}
          {canRegenerate && (
            <button type="button" className="btn secondary" onClick={askRegenerate} disabled={locked}>
              <AIcon name="refresh" />
              {t('Régénérer', 'Regenerate')}
            </button>
          )}
          {canApprove && (
            <button type="button" className="btn studio-primary" onClick={approve} disabled={locked || !mediaOk}>
              <AIcon name="check" />
              {busy === 'approve' ? t('Validation…', 'Approving…') : t('Valider', 'Approve')}
            </button>
          )}
          {draft.status === 'approved' && (
            <button type="button" className="btn brand studio-primary" onClick={() => setPublishing(true)} disabled={locked}>
              <AIcon name="external" />
              {t('Marquer comme publié', 'Mark as published')}
            </button>
          )}
          <span className="studio-live" aria-live="polite">
            {copied === 'ok' && t('Texte copié', 'Text copied')}
            {copied === 'fail' && t('Copie impossible : sélectionnez le texte puis copiez-le à la main.', 'Could not copy: select the text and copy it by hand.')}
          </span>
        </div>
      )}

      {confirmRegen && (
        <ConfirmDialog
          lang={lang}
          title={t('Régénérer ce post ?', 'Regenerate this post?')}
          body={
            draft.version?.source === 'owner'
              ? t(
                  'Vos modifications seront remplacées par un nouveau texte rédigé par Gabee. Les versions précédentes restent dans l’historique.',
                  'Your edits will be replaced by a new text written by Gabee. Earlier versions stay in the history.',
                )
              : t('Ce post est validé. Le régénérer retire la validation : il faudra le relire et le valider à nouveau.', 'This post is approved. Regenerating it removes the approval: you will need to review and approve it again.')
          }
          confirmLabel={t('Régénérer', 'Regenerate')}
          onConfirm={() => void regenerate()}
          onClose={() => setConfirmRegen(false)}
        />
      )}
      {publishing && (
        <PublishDialog
          draft={draft}
          lang={lang}
          onClose={() => setPublishing(false)}
          onPublished={(d) => {
            setPublishing(false);
            onChange(d);
          }}
        />
      )}
    </article>
  );
}

/** A planned platform whose draft does not exist yet (the 04:00 run writes it). */
export function PendingPostCard({ platform, language, lang }: { platform: ContentPlatform; language: ContentLanguage; lang: Language }) {
  const L = lang === 'fr';
  const titleId = useId();
  return (
    <article className="card studio-post is-pending" aria-labelledby={titleId}>
      <header className="studio-post-head">
        <PlatformMark platform={platform} />
        <div className="col studio-post-title">
          <h3 id={titleId}>{PLATFORM_LABEL[platform]}</h3>
          <span className="card-title-sub">
            {L ? 'Post en ' : 'Post in '}
            {LANGUAGE_LABEL[language][lang]}
          </span>
        </div>
        <span className="badge neutral">
          <i className="bdot" />
          {L ? 'Pas encore rédigé' : 'Not written yet'}
        </span>
      </header>
      <div className="studio-post-body">
        <p className="studio-muted-text">
          {L
            ? 'Gabee rédige les posts du jour chaque matin vers 4 h (heure du studio). Revenez un peu plus tard.'
            : "Gabee writes the day's posts every morning around 4 am (studio time). Check back a little later."}
        </p>
      </div>
    </article>
  );
}

function PlatformMark({ platform }: { platform: ContentPlatform }) {
  return (
    <span className={`studio-pmark ${platform}`} aria-hidden>
      {platform === 'linkedin' ? 'in' : '♪'}
    </span>
  );
}

// ── Preview ──

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

function Preview({ draft, lang }: { draft: DraftDto; lang: Language }) {
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

function MediaNotices({ draft, lang }: { draft: DraftDto; lang: Language }) {
  const L = lang === 'fr';
  const m = draft.media;
  const libraryLink = (label: string) => (
    <Link className="btn secondary sm" href={MEDIA_LIBRARY}>
      {label}
    </Link>
  );
  if (draft.platform === 'tiktok') {
    if (m && m.kind === 'video' && m.cleared) return null;
    if (m && m.kind === 'video') {
      return (
        <Notice tone="warn" action={libraryLink(L ? 'Ouvrir la Médiathèque' : 'Open the Media library')}>
          {L
            ? 'Ce média n’est pas autorisé à la publication — autorisez-le dans la Médiathèque.'
            : 'This media is not cleared for publication — clear it in the Media library.'}
        </Notice>
      );
    }
    return (
      <Notice tone="warn" action={libraryLink(L ? 'Ouvrir la Médiathèque' : 'Open the Media library')}>
        {L
          ? 'Un post TikTok est une vidéo. Filmez-la en suivant le plan, ajoutez-la à la Médiathèque et autorisez-la : vous pourrez ensuite valider ce post.'
          : 'A TikTok post is a video. Film it following the plan, add it to the Media library and clear it: you can then approve this post.'}
      </Notice>
    );
  }
  if (!m) {
    return (
      <Notice tone="info" action={libraryLink(L ? 'Téléverser un fichier' : 'Upload a file')}>
        {L ? 'Aucun média autorisé — le post partira en texte seul' : 'No cleared media — the post will go out as text only'}
      </Notice>
    );
  }
  if (!m.cleared) {
    return (
      <Notice tone="warn" action={libraryLink(L ? 'Ouvrir la Médiathèque' : 'Open the Media library')}>
        {L
          ? 'Ce média n’est pas autorisé à la publication — autorisez-le dans la Médiathèque.'
          : 'This media is not cleared for publication — clear it in the Media library.'}
      </Notice>
    );
  }
  return null;
}

function PublicationSummary({ publication, lang }: { publication: NonNullable<DraftDto['publication']>; lang: Language }) {
  const L = lang === 'fr';
  return (
    <div className="studio-published">
      <p>
        <AIcon name="check" size={16} />
        {L ? 'Publié le ' : 'Published on '}
        {dateTime(publication.published_at, lang)}
        {' · '}
        <a href={publication.post_url} target="_blank" rel="noopener noreferrer">
          {L ? 'Voir le post' : 'View the post'} ↗
        </a>
      </p>
      {publication.rating !== null && (
        <p className="studio-rating" aria-label={L ? `Note : ${publication.rating} sur 5` : `Rating: ${publication.rating} out of 5`}>
          <span aria-hidden>
            {'★'.repeat(publication.rating)}
            <span className="off">{'★'.repeat(5 - publication.rating)}</span>
          </span>
        </p>
      )}
      {publication.comment && <blockquote>{publication.comment}</blockquote>}
    </div>
  );
}

// ── Edit ──

function DraftEditor({
  draft,
  lang,
  busy,
  onCancel,
  onSave,
}: {
  draft: DraftDto;
  lang: Language;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: string, hashtags: string[]) => void;
}) {
  const L = lang === 'fr';
  const isLi = draft.platform === 'linkedin';
  const p = draft.payload!;
  const url = draft.tracked_url;
  const initial = isLi ? stripLink((p as LinkedInPost).body, url) : (p as TikTokPost).caption;
  const [body, setBody] = useState(initial);
  const [tags, setTags] = useState(p.hashtags.join(' '));
  const id = useId();
  const hashtags = tags
    .split(/\s+/)
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`));

  return (
    <form
      className="studio-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) onSave(body, hashtags);
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
