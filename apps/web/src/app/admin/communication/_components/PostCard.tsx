'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { ContentLanguage, ContentPlatform, Language } from '@gabee/types';
import type { DraftDto } from '@/lib/server/content-studio/drafts';
import type { PublishContext } from '@/lib/server/content-studio/publish-links';
import { AIcon } from '../../_shell/icons';
import { ApiError, api, downloadDraftMedia, notifyStudioChanged, reportUnexpected } from './api';
import { copyText } from './copy';
import { ConfirmDialog } from './Dialog';
import { DraftEditor } from './DraftEditor';
import { AiWorking, ErrorNotice, Notice } from './ErrorNotice';
import { errorText } from './errors';
import { ExternalMediaDialog, ownMediaLabel, saveOwnMedia } from './ExternalMediaDialog';
import { DRAFT_STATUS, LANGUAGE_LABEL, PLATFORM_LABEL, dateTime, postText } from './format';
import { Preview } from './PostPreview';
import { PublishDialog } from './PublishDialog';
import { MissingPublishLink, OpenPlatformLink } from './PublishLink';

const MEDIA_LIBRARY = '/admin/communication/medias';
const MEDIA_UPLOAD = '/admin/communication/medias?upload=1';

type Busy = null | 'approve' | 'regenerate' | 'save' | 'download' | 'own';

/**
 * Draft card of the Aujourd'hui screen: preview, status, and the owner's
 * actions on one platform's post. `publish`: the links « Copier et ouvrir »
 * opens (absent: no such button).
 */
export function PostCard({ draft, lang, onChange, publish }: { draft: DraftDto; lang: Language; onChange: (d: DraftDto) => void; publish?: PublishContext }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const titleId = useId();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ text: string; details?: string[] } | null>(null);
  const [editing, setEditing] = useState(false);
  /** Open the editor straight on "Choisir un média" (from the media notice). */
  const [pickFirst, setPickFirst] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  /** `publish`: copied by « Copier et ouvrir » (says where to paste). */
  const [copied, setCopied] = useState<null | 'ok' | 'fail' | 'publish'>(null);
  /** The platform's publish page was opened from this card: say what to do once the post is live. */
  const [opened, setOpened] = useState(false);
  const [ownDialog, setOwnDialog] = useState(false);
  const [confirmOwnOff, setConfirmOwnOff] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), copied === 'publish' ? 6000 : 3000);
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
  /** The owner posts with their own file, outside the Médiathèque. */
  const own = draft.external_media;
  const mediaOk = isTikTok ? videoOk || own !== null : media === null || media.cleared;
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

  /** `media`: the new attachment (an id, or null to remove it); undefined leaves it as it is. */
  const save = (body: string, hashtags: string[], media: string | null | undefined) =>
    run('save', async () => {
      const res = await api<{ draft: DraftDto }>(`/drafts/${draft.id}`, {
        method: 'PATCH',
        body: { body, hashtags, ...(media !== undefined ? { media_asset_id: media } : {}) },
      });
      onChange(res.draft);
      setEditing(false);
      notifyStudioChanged();
    });

  const canEdit = hasText && ['ready', 'approved', 'stale', 'failed'].includes(draft.status);
  const openEditor = (pick: boolean) => {
    setPickFirst(pick);
    setEditing(true);
  };
  const canRegenerate = ['ready', 'approved', 'stale'].includes(draft.status);
  const canApprove = hasText && ['ready', 'stale'].includes(draft.status);
  const canOpen = hasText && !generating && !crashed && ['ready', 'approved'].includes(draft.status);
  const publishUrl = publish?.publish_links[draft.platform] ?? null;

  const ownOff = () =>
    run('own', async () => {
      setConfirmOwnOff(false);
      onChange(await saveOwnMedia(draft.id, false));
    });
  // Turning it off on an approved TikTok post with no library video removes the approval: ask first.
  const askOwnOff = () => (draft.status === 'approved' && isTikTok && !videoOk ? setConfirmOwnOff(true) : void ownOff());
  const ownActions = canEdit && !locked ? { on: () => setOwnDialog(true), off: askOwnOff } : undefined;

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
          <DraftEditor draft={draft} lang={lang} busy={busy === 'save'} pickFirst={pickFirst} onCancel={() => setEditing(false)} onSave={save} />
        ) : (
          hasText && !generating && <Preview draft={draft} lang={lang} />
        )}

        {hasText && !generating && !crashed && !editing && draft.status !== 'published' && (
          <MediaNotices draft={draft} lang={lang} onPick={canEdit && !locked ? () => openEditor(true) : undefined} own={ownActions} />
        )}

        {isTikTok && canOpen && !editing && (videoOk || own) && (
          <p className="help studio-publish-hint">
            {videoOk
              ? t(
                  '1. Téléchargez la vidéo · 2. Ouvrez TikTok et déposez-la · 3. Collez la légende',
                  '1. Download the video · 2. Open TikTok and drop it in · 3. Paste the caption',
                )
              : t('Publiez avec votre vidéo, puis collez la légende', 'Post with your video, then paste the caption')}
          </p>
        )}

        {opened && canOpen && !editing && (
          <Notice tone="info">
            <p>
              {draft.status === 'approved'
                ? t(
                    `Une fois le post en ligne sur ${platform}, revenez ici : « Marquer comme publié », puis collez son adresse.`,
                    `Once the post is live on ${platform}, come back here: “Mark as published”, then paste its address.`,
                  )
                : t(
                    `Validez ce post, puis marquez-le comme publié une fois en ligne sur ${platform}.`,
                    `Approve this post, then mark it as published once it is live on ${platform}.`,
                  )}
            </p>
          </Notice>
        )}

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
              {busy === 'download'
                ? t('Préparation…', 'Preparing…')
                : media.kind === 'video'
                  ? t('Télécharger la vidéo', 'Download the video')
                  : t('Télécharger le média', 'Download media')}
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn secondary" onClick={() => openEditor(false)} disabled={locked}>
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
          {canOpen &&
            publish &&
            (publishUrl ? (
              <OpenPlatformLink
                platform={draft.platform}
                url={publishUrl}
                text={postText(draft)}
                lang={lang}
                primary={draft.status === 'approved'}
                onCopied={(ok) => {
                  setCopied(ok ? 'publish' : 'fail');
                  setOpened(true);
                }}
              />
            ) : (
              <MissingPublishLink platform={draft.platform} lang={lang} canEdit={publish.can_edit_settings} />
            ))}
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
            {copied === 'publish' &&
              (isTikTok ? t('Légende copiée — collez-la dans TikTok', 'Caption copied — paste it in TikTok') : t('Texte copié — collez-le dans LinkedIn', 'Text copied — paste it in LinkedIn'))}
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
      {confirmOwnOff && (
        <ConfirmDialog
          lang={lang}
          title={t('Ne plus utiliser votre vidéo ?', 'Stop using your own video?')}
          body={t(
            'Ce post n’a pas de vidéo de la Médiathèque : il ne sera plus validé, et il faudra joindre une vidéo autorisée pour le valider à nouveau.',
            'This post has no Media library video: it will no longer be approved, and a cleared video must be attached to approve it again.',
          )}
          confirmLabel={t('Ne plus l’utiliser', 'Stop using it')}
          danger
          onConfirm={() => void ownOff()}
          onClose={() => setConfirmOwnOff(false)}
        />
      )}
      {ownDialog && (
        <ExternalMediaDialog
          draft={draft}
          lang={lang}
          onClose={() => setOwnDialog(false)}
          onSaved={(d) => {
            setOwnDialog(false);
            onChange(d);
          }}
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

/** `own`: turn the owner's own media on (or edit its note) and off; absent when the draft cannot change now. */
function MediaNotices({ draft, lang, onPick, own }: { draft: DraftDto; lang: Language; onPick?: () => void; own?: { on: () => void; off: () => void } }) {
  const L = lang === 'fr';
  const m = draft.media;
  const isTikTok = draft.platform === 'tiktok';
  const link = (label: string, href = MEDIA_LIBRARY) => (
    <Link className="btn secondary sm" href={href}>
      {label}
    </Link>
  );
  const pick = (label: string) =>
    onPick && (
      <button type="button" className="btn secondary sm" onClick={onPick}>
        {label}
      </button>
    );
  const ownButton = own && (
    <button type="button" className="btn secondary sm" onClick={own.on}>
      {ownMediaLabel(draft.platform, lang)}
    </button>
  );
  /** The owner's own file: said plainly, with its note; the library stays one click away. */
  const ownNotice = draft.external_media && (
    <Notice
      tone="info"
      action={
        <>
          {pick(isTikTok ? (L ? 'Choisir une vidéo' : 'Choose a video') : L ? 'Choisir un média' : 'Choose media')}
          {own && (
            <button type="button" className="btn secondary sm" onClick={own.on}>
              {L ? 'Modifier la note' : 'Edit the note'}
            </button>
          )}
          {own && (
            <button type="button" className="btn ghost sm" onClick={own.off}>
              {isTikTok ? (L ? 'Ne plus utiliser ma vidéo' : 'Stop using my video') : L ? 'Ne plus utiliser mon média' : 'Stop using my media'}
            </button>
          )}
        </>
      }
    >
      <p>
        <b>{isTikTok ? (L ? 'Vidéo hors Médiathèque' : 'Video outside the Media library') : L ? 'Média hors Médiathèque' : 'Media outside the Media library'}</b>
        {draft.external_media.note && <span className="studio-own-note"> · {draft.external_media.note}</span>}
      </p>
    </Notice>
  );
  const notCleared = (
    <Notice
      tone="warn"
      action={
        <>
          {link(L ? 'Ouvrir la Médiathèque' : 'Open the Media library')}
          {pick(L ? 'Changer de média' : 'Change media')}
          {isTikTok && ownButton}
        </>
      }
    >
      {L
        ? 'Ce média n’est pas autorisé à la publication — autorisez-le dans la Médiathèque.'
        : 'This media is not cleared for publication — clear it in the Media library.'}
    </Notice>
  );
  if (isTikTok) {
    if (m && m.kind === 'video' && m.cleared) return null;
    if (ownNotice) return ownNotice;
    if (m && m.kind === 'video') return notCleared;
    return (
      <Notice
        tone="warn"
        action={
          <>
            {pick(L ? 'Choisir une vidéo' : 'Choose a video')}
            {link(L ? 'Téléverser une vidéo' : 'Upload a video', MEDIA_UPLOAD)}
            {ownButton}
          </>
        }
      >
        {L
          ? 'Un post TikTok est une vidéo. Filmez-la en suivant le plan, ajoutez-la à la Médiathèque et autorisez-la, puis joignez-la ici : vous pourrez ensuite valider ce post.'
          : 'A TikTok post is a video. Film it following the plan, add it to the Media library and clear it, then attach it here: you can then approve this post.'}
      </Notice>
    );
  }
  if (!m && ownNotice) return ownNotice;
  if (!m) {
    return (
      <Notice
        tone="info"
        action={
          <>
            {pick(L ? 'Choisir un média' : 'Choose media')}
            {link(L ? 'Téléverser un fichier' : 'Upload a file', MEDIA_UPLOAD)}
            {ownButton}
          </>
        }
      >
        {L ? 'Aucun média autorisé — le post partira en texte seul' : 'No cleared media — the post will go out as text only'}
      </Notice>
    );
  }
  if (!m.cleared) return notCleared;
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
