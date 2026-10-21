'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CONTENT_LANGUAGES, type ContentLanguage, type Language, type MediaAspect } from '@gabee/types';
import type { MediaAssetDto } from '@/lib/server/content-studio/media';
import { ApiError, api, reportUnexpected } from './api';
import { Dialog } from './Dialog';
import { errorText } from './errors';
import { LANGUAGE_LABEL } from './format';
import { ASPECT_LABEL, MEDIA_ASPECTS, checkFile, fileSize, parseTags, tagsError, uploadMime, type UploadMime } from './media';

/**
 * Upload one file to the library: ask the server for a signed PUT URL (it
 * checks type and size and records a pending row), send the bytes straight
 * to storage with progress (XMLHttpRequest: `fetch` reports no upload
 * progress), then ask the server to verify what arrived. Only a verified
 * file enters the library.
 */

type Phase =
  | { step: 'idle' }
  | { step: 'init' }
  | { step: 'put'; sent: number; total: number }
  | { step: 'verify' };

class PutError extends Error {
  constructor(readonly aborted: boolean) {
    super(aborted ? 'upload aborted' : 'upload failed');
  }
}

/** PUT `file` to the signed URL with exactly the signed Content-Type; resolves when storage accepted it. */
function putFile(url: string, file: File, mime: UploadMime, onProgress: (sent: number) => void, xhrRef: { current: XMLHttpRequest | null }): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mime);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new PutError(false)));
    // A CORS refusal, a dropped connection or an expired signature all land here: the browser does not say which.
    xhr.onerror = () => reject(new PutError(false));
    xhr.ontimeout = () => reject(new PutError(false));
    xhr.onabort = () => reject(new PutError(true));
    xhr.send(file);
  });
}

export function MediaUploader({ lang, onClose, onUploaded }: { lang: Language; onClose: () => void; onUploaded: (asset: MediaAssetDto) => void }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [aspect, setAspect] = useState<MediaAspect | ''>('');
  const [aspectMissing, setAspectMissing] = useState(false);
  const [language, setLanguage] = useState<ContentLanguage | ''>('');
  const [tagsText, setTagsText] = useState('');
  const [phase, setPhase] = useState<Phase>({ step: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      xhr.current?.abort();
    },
    [],
  );

  const busy = phase.step !== 'idle';
  const mime = file ? uploadMime(file) : null;
  const isVideo = mime === 'video/mp4';
  const tags = parseTags(tagsText);
  const tagsProblem = tagsError(tags, lang);

  function choose(f: File | null) {
    setFile(f);
    setError(null);
    setAspectMissing(false);
    setFileError(f ? checkFile(f, lang) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!file) {
      setFileError(t('Choisissez un fichier à envoyer.', 'Choose a file to upload.'));
      return;
    }
    const problem = checkFile(file, lang);
    if (problem || !mime) {
      setFileError(problem);
      return;
    }
    if (isVideo && !aspect) {
      setAspectMissing(true);
      return;
    }
    if (tagsProblem) return;
    setError(null);
    // The server keeps at most 200 characters of the name; keep the extension.
    const name = file.name.length > 200 ? `${file.name.slice(0, 190)}.${file.name.split('.').pop()}` : file.name;
    let stage: 'init' | 'put' | 'verify' = 'init';
    try {
      setPhase({ step: 'init' });
      const { assetId, uploadUrl } = await api<{ assetId: string; uploadUrl: string }>('/media', {
        method: 'POST',
        body: {
          file_name: name,
          mime,
          size_bytes: file.size,
          ...(aspect ? { aspect } : {}),
          ...(language ? { language } : {}),
          ...(tags.length ? { tags } : {}),
        },
      });
      stage = 'put';
      setPhase({ step: 'put', sent: 0, total: file.size });
      await putFile(uploadUrl, file, mime, (sent) => mounted.current && setPhase({ step: 'put', sent, total: file.size }), xhr);
      stage = 'verify';
      setPhase({ step: 'verify' });
      const { asset } = await api<{ asset: MediaAssetDto }>(`/media/${assetId}/complete`, { method: 'POST' });
      if (!mounted.current) return;
      if (asset.status !== 'ready') {
        setError(
          t(
            `Le fichier a été refusé à la vérification : ${asset.rejectReason ?? 'son contenu ne correspond pas à son type.'}`,
            `The file was rejected at verification: ${asset.rejectReason ?? 'its content does not match its type.'}`,
          ),
        );
        setPhase({ step: 'idle' });
        return;
      }
      onUploaded(asset);
    } catch (err) {
      if (!mounted.current) return;
      setPhase({ step: 'idle' });
      if (err instanceof PutError) {
        setError(
          err.aborted
            ? t('Envoi annulé. Le fichier n’a pas été ajouté.', 'Upload cancelled. The file was not added.')
            : t(
                'Le transfert a échoué. Réessayez ; si cela se répète, vérifiez la configuration du stockage (voir le runbook).',
                'The transfer failed. Try again; if it keeps happening, check the storage configuration (see the runbook).',
              ),
        );
        return;
      }
      reportUnexpected(err, { action: `media-upload-${stage}` });
      setError(
        errorText(err, lang, {
          // The shared validation message is English; the server checked type and size.
          validation_error: {
            fr: 'Ce fichier n’est pas accepté : PNG, JPEG, WebP (15 Mo max) ou MP4 (300 Mo max), et une vidéo a besoin de son format.',
            en: 'This file is not accepted: PNG, JPEG, WebP (15 MB max) or MP4 (300 MB max), and a video needs its format.',
          },
          ...(stage === 'verify' && err instanceof ApiError && err.status >= 500
            ? {
                [err.code]: {
                  fr: 'Le fichier est arrivé, mais sa vérification a échoué. Réessayez l’envoi dans quelques minutes.',
                  en: 'The file arrived, but checking it failed. Try the upload again in a few minutes.',
                },
              }
            : {}),
        }),
      );
    }
  }

  const formId = `${id}-upload`;
  const percent = phase.step === 'put' && phase.total > 0 ? Math.min(100, Math.round((phase.sent / phase.total) * 100)) : null;
  const stepText =
    phase.step === 'init'
      ? t('Préparation de l’envoi…', 'Preparing the upload…')
      : phase.step === 'put'
        ? t(`Envoi… ${percent ?? 0} %`, `Uploading… ${percent ?? 0}%`)
        : phase.step === 'verify'
          ? t('Vérification du fichier…', 'Checking the file…')
          : '';

  return (
    <Dialog
      title={t('Téléverser un fichier', 'Upload a file')}
      lang={lang}
      onClose={onClose}
      busy={busy}
      footer={
        busy ? (
          <button type="button" className="btn secondary" onClick={() => xhr.current?.abort()} disabled={phase.step !== 'put'}>
            {t('Annuler l’envoi', 'Cancel upload')}
          </button>
        ) : (
          <>
            <button type="button" className="btn secondary" onClick={onClose}>
              {t('Fermer', 'Close')}
            </button>
            <button type="submit" form={formId} className="btn">
              {t('Envoyer le fichier', 'Upload the file')}
            </button>
          </>
        )
      }
    >
      <form id={formId} className="col gap16" onSubmit={submit} noValidate>
        <fieldset className="studio-fieldset" disabled={busy}>
          <div>
            <label className="field-label" htmlFor={`${id}-file`}>
              {t('Fichier', 'File')}
            </label>
            <input
              id={`${id}-file`}
              className="inp studio-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4"
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              aria-invalid={fileError !== null}
              aria-describedby={`${id}-file-help${fileError ? ` ${id}-file-err` : ''}`}
              data-autofocus
            />
            <p id={`${id}-file-help`} className="help">
              {t('Images PNG, JPEG ou WebP (15 Mo max) · vidéos MP4 (300 Mo max).', 'PNG, JPEG or WebP images (15 MB max) · MP4 videos (300 MB max).')}
              {file && !fileError && ` ${t('Choisi :', 'Chosen:')} ${file.name} · ${fileSize(file.size, lang)}`}
            </p>
            {fileError && (
              <p id={`${id}-file-err`} className="studio-field-error" role="alert">
                {fileError}
              </p>
            )}
          </div>

          {isVideo && (
            <div>
              <label className="field-label" htmlFor={`${id}-aspect`}>
                {t('Format de la vidéo', 'Video format')}
              </label>
              <select
                id={`${id}-aspect`}
                className="inp"
                value={aspect}
                onChange={(e) => {
                  setAspect(e.target.value as MediaAspect | '');
                  setAspectMissing(false);
                }}
                aria-invalid={aspectMissing}
                aria-describedby={aspectMissing ? `${id}-aspect-err` : `${id}-aspect-help`}
              >
                <option value="">{t('Choisir…', 'Choose…')}</option>
                {MEDIA_ASPECTS.map((a) => (
                  <option key={a} value={a}>
                    {ASPECT_LABEL[a][lang]}
                  </option>
                ))}
              </select>
              {aspectMissing ? (
                <p id={`${id}-aspect-err`} className="studio-field-error" role="alert">
                  {t('Choisissez le format de la vidéo.', 'Choose the video format.')}
                </p>
              ) : (
                <p id={`${id}-aspect-help`} className="help">
                  {t('TikTok n’utilise que des vidéos verticales (9:16).', 'TikTok only uses vertical videos (9:16).')}
                </p>
              )}
            </div>
          )}

          <div className="studio-form-row">
            <div>
              <label className="field-label" htmlFor={`${id}-lang`}>
                {t('Langue du contenu (facultatif)', 'Content language (optional)')}
              </label>
              <select id={`${id}-lang`} className="inp" value={language} onChange={(e) => setLanguage(e.target.value as ContentLanguage | '')}>
                <option value="">{t('Sans texte ni voix', 'No text or voice')}</option>
                {CONTENT_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABEL[l][lang].replace(/^./, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor={`${id}-tags`}>
                {t('Mots-clés (facultatif)', 'Tags (optional)')}
              </label>
              <input
                id={`${id}-tags`}
                className="inp"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder={t('ex. code, niveau 2, rentrée', 'e.g. code, level 2, back to school')}
                autoCapitalize="off"
                aria-invalid={tagsProblem !== null}
                aria-describedby={`${id}-tags-help`}
              />
              <p id={`${id}-tags-help`} className={tagsProblem ? 'studio-field-error' : 'help'}>
                {tagsProblem ?? t('Séparés par des virgules. Ils aident Gabee à choisir le bon média.', 'Comma-separated. They help Gabee pick the right media.')}
              </p>
            </div>
          </div>
        </fieldset>

        {busy && (
          <div className="studio-upload-progress" aria-live="polite">
            <p className="studio-upload-step">{stepText}</p>
            <div
              className={'studio-bar' + (percent === null ? ' is-indeterminate' : '')}
              role="progressbar"
              aria-label={t('Envoi du fichier', 'File upload')}
              aria-valuemin={0}
              aria-valuemax={100}
              {...(percent !== null ? { 'aria-valuenow': percent } : {})}
            >
              <i style={percent !== null ? { width: `${percent}%` } : undefined} />
            </div>
            {phase.step === 'put' && (
              <p className="help">
                {fileSize(phase.sent, lang)} {t('sur', 'of')} {fileSize(phase.total, lang)}
                {' · '}
                {t('Gardez cette page ouverte.', 'Keep this page open.')}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="studio-field-error" role="alert">
            {error}
          </p>
        )}
        <p className="help">
          {t(
            'Un fichier ajouté n’est pas encore autorisé à la publication : vérifiez-le, puis autorisez-le dans la Médiathèque.',
            'A new file is not cleared for publication yet: check it, then clear it in the Media library.',
          )}
        </p>
      </form>
    </Dialog>
  );
}
