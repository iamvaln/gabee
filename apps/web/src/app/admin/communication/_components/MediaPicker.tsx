'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import type { ContentPlatform, Language } from '@gabee/types';
import { AIcon } from '../../_shell/icons';
import { api, mediaFileUrl, reportUnexpected } from './api';
import { Dialog } from './Dialog';
import { ErrorNotice, Notice } from './ErrorNotice';
import { errorText } from './errors';
import { PLATFORM_LABEL } from './format';
import { assetMeta, pickerFilter, type LibraryAsset } from './media';

const UPLOAD_LINK = '/admin/communication/medias?upload=1';

/**
 * "Choisir un média" for one post: the library's verified files that fit the
 * platform (TikTok: vertical videos). Files not yet cleared are listed but
 * flagged — the post can be approved once the file is cleared.
 */
export function MediaPicker({
  platform,
  lang,
  currentId,
  onClose,
  onPick,
}: {
  platform: ContentPlatform;
  lang: Language;
  currentId: string | null;
  onClose: () => void;
  onPick: (asset: LibraryAsset) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(currentId);

  const load = useCallback(async () => {
    const f = pickerFilter(platform);
    const q = new URLSearchParams({ ...(f.kind ? { kind: f.kind } : {}), ...(f.aspect ? { aspect: f.aspect } : {}) }).toString();
    try {
      const res = await api<{ assets: LibraryAsset[] }>(`/media${q ? `?${q}` : ''}`);
      // Cleared files first: they are the ones that can go out today.
      setAssets([...res.assets].sort((a, b) => Number(b.cleared) - Number(a.cleared)));
      setError(null);
    } catch (err) {
      reportUnexpected(err, { action: 'load-media-picker', platform });
      setError(errorText(err, lang));
    }
  }, [lang, platform]);

  useEffect(() => {
    void load();
  }, [load]);

  const picked = assets?.find((a) => a.id === chosen) ?? null;
  const tiktok = platform === 'tiktok';

  return (
    <Dialog
      title={t('Choisir un média', 'Choose media')}
      lang={lang}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            {t('Annuler', 'Cancel')}
          </button>
          <button type="button" className="btn" disabled={!picked || picked.id === currentId} onClick={() => picked && onPick(picked)}>
            {t('Joindre ce média', 'Attach this media')}
          </button>
        </>
      }
    >
      <p className="studio-dialog-text">
        {tiktok
          ? t('Un post TikTok est une vidéo verticale (9:16). Voici celles de la médiathèque.', 'A TikTok post is a vertical video (9:16). Here are the library’s.')
          : t(`Images et vidéos de la médiathèque pour ce post ${PLATFORM_LABEL[platform]}.`, `Library images and videos for this ${PLATFORM_LABEL[platform]} post.`)}
      </p>
      {error && <ErrorNotice lang={lang} message={error} onRetry={() => void load()} />}
      {!assets && !error && (
        <div className="studio-skeleton" aria-busy="true" aria-label={t('Chargement', 'Loading')}>
          <div className="skel" style={{ height: 64 }} />
          <div className="skel" style={{ height: 64 }} />
        </div>
      )}
      {assets && assets.length === 0 && (
        <Notice
          tone="info"
          action={
            <Link className="btn secondary sm" href={UPLOAD_LINK}>
              {t('Téléverser un fichier', 'Upload a file')}
            </Link>
          }
        >
          <p>
            {tiktok
              ? t('Aucune vidéo verticale (9:16) dans la médiathèque pour l’instant.', 'No vertical (9:16) video in the library yet.')
              : t('La médiathèque est vide pour l’instant.', 'The library is empty for now.')}
          </p>
        </Notice>
      )}
      {assets && assets.length > 0 && (
        <fieldset className="studio-fieldset">
          <legend className="sr-only">{t('Fichiers', 'Files')}</legend>
          <ul className="studio-picks">
            {assets.map((a) => (
              <li key={a.id}>
                <label className={'studio-pick' + (chosen === a.id ? ' on' : '')}>
                  <input type="radio" className="studio-radio" name={`${id}-media`} value={a.id} checked={chosen === a.id} onChange={() => setChosen(a.id)} />
                  <span className="studio-pick-thumb" aria-hidden>
                    {a.kind === 'image' ? <img src={mediaFileUrl(a.id)} alt="" loading="lazy" /> : <AIcon name="play" size={18} />}
                  </span>
                  <span className="studio-pick-text">
                    <span className="studio-pick-name">{a.fileName}</span>
                    <span className="studio-pick-meta">{assetMeta(a, lang)}</span>
                  </span>
                  <span className={`badge ${a.cleared ? 'ok' : 'warn'}`}>
                    <i className="bdot" />
                    {a.cleared ? t('Autorisé', 'Cleared') : t('Non autorisé', 'Not cleared')}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {picked && !picked.cleared && (
        <Notice tone="warn">
          <p>
            {t(
              'Ce média n’est pas encore autorisé : vous pourrez le joindre, mais valider le post attendra son autorisation dans la Médiathèque.',
              'This media is not cleared yet: you can attach it, but approving the post waits for its clearance in the Media library.',
            )}
          </p>
        </Notice>
      )}
    </Dialog>
  );
}
