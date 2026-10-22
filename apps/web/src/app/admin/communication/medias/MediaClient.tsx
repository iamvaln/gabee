'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Language, MediaAspect } from '@gabee/types';
import type { MediaAssetDto } from '@/lib/server/content-studio/media';
import { EmptyState, PageHead } from '../../_shell/primitives';
import { AIcon } from '../../_shell/icons';
import { api, downloadMedia, mediaFileUrl, notifyStudioChanged, reportUnexpected } from '../_components/api';
import { Dialog } from '../_components/Dialog';
import { ErrorNotice, Notice } from '../_components/ErrorNotice';
import { errorText } from '../_components/errors';
import { LANGUAGE_LABEL, dateTime } from '../_components/format';
import { MediaUploader } from '../_components/MediaUploader';
import { MEDIA_ASPECTS, assetMeta, parseTags, tagsError, type LibraryAsset } from '../_components/media';

type Filters = { kind: '' | 'image' | 'video'; aspect: '' | MediaAspect; cleared: '' | 'true' | 'false' };
const NO_FILTER: Filters = { kind: '', aspect: '', cleared: '' };

function query(f: Filters): string {
  const q = new URLSearchParams();
  if (f.kind) q.set('kind', f.kind);
  if (f.aspect) q.set('aspect', f.aspect);
  if (f.cleared) q.set('cleared', f.cleared);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * Médiathèque: every verified file, filtered by kind, format and clearance;
 * upload, clear for publication (or withdraw it), tags and download.
 */
export function MediaClient({ lang, openUpload }: { lang: Language; openUpload: boolean }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(openUpload);
  const [added, setAdded] = useState<MediaAssetDto | null>(null);

  // Quick filter taps can answer out of order: only the latest request may update the grid.
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await api<{ assets: LibraryAsset[] }>(`/media${query(filters)}`);
      if (mine !== seq.current) return;
      setAssets(res.assets);
      setLoadError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      reportUnexpected(err, { action: 'load-media' });
      setLoadError(errorText(err, lang));
    }
  }, [filters, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (next: LibraryAsset) => setAssets((list) => list?.map((a) => (a.id === next.id ? next : a)) ?? list);
  const filtered = filters.kind !== '' || filters.aspect !== '' || filters.cleared !== '';

  const head = (
    <PageHead
      title={t('Médiathèque', 'Media library')}
      sub={t(
        'Les images et vidéos que Gabee peut joindre aux posts. Seuls les fichiers autorisés partent en publication.',
        'The images and videos Gabee can attach to posts. Only cleared files are published.',
      )}
    >
      <button type="button" className="btn brand" onClick={() => setUploading(true)}>
        <AIcon name="plus" />
        {t('Téléverser un fichier', 'Upload a file')}
      </button>
    </PageHead>
  );

  return (
    <>
      {head}
      {added && (
        <div role="status">
          <Notice
            tone="ok"
            action={
              <button type="button" className="btn secondary sm" onClick={() => setAdded(null)}>
                {t('Compris', 'Got it')}
              </button>
            }
          >
            <p>
              {L
                ? `${added.fileName} est dans la médiathèque. Il n’est pas encore autorisé à la publication : vérifiez-le, puis autorisez-le.`
                : `${added.fileName} is in the library. It is not cleared for publication yet: check it, then clear it.`}
            </p>
          </Notice>
        </div>
      )}

      <FilterBar lang={lang} value={filters} onChange={setFilters} count={assets?.length ?? null} />

      {loadError && <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />}

      {!assets && !loadError && (
        <div className="studio-media-grid" aria-busy="true" aria-label={t('Chargement', 'Loading')}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ height: 300 }} />
          ))}
        </div>
      )}

      {assets && assets.length === 0 && (
        <div className="card">
          {filtered ? (
            <EmptyState
              icon="🔎"
              title={t('Aucun fichier ne correspond à ces filtres', 'No file matches these filters')}
              action={
                <button type="button" className="btn secondary" onClick={() => setFilters(NO_FILTER)}>
                  {t('Effacer les filtres', 'Clear filters')}
                </button>
              }
            />
          ) : (
            <EmptyState
              icon="🖼️"
              title={t('La médiathèque est vide', 'The media library is empty')}
              body={t(
                'Ajoutez les images et vidéos de Gabee (captures du jeu, vidéos filmées pour TikTok). Gabee les proposera pour les posts une fois autorisées.',
                'Add Gabee images and videos (game captures, videos filmed for TikTok). Gabee offers them for posts once cleared.',
              )}
              action={
                <button type="button" className="btn brand" onClick={() => setUploading(true)}>
                  {t('Téléverser un fichier', 'Upload a file')}
                </button>
              }
            />
          )}
        </div>
      )}

      {assets && assets.length > 0 && (
        <ul className="studio-media-grid" aria-label={t('Fichiers', 'Files')}>
          {assets.map((a) => (
            <li key={a.id}>
              <AssetCard asset={a} lang={lang} onChange={replace} />
            </li>
          ))}
        </ul>
      )}

      {uploading && (
        <MediaUploader
          lang={lang}
          onClose={() => setUploading(false)}
          onUploaded={(asset) => {
            setUploading(false);
            setAdded(asset);
            setFilters(NO_FILTER);
            void load();
          }}
        />
      )}
    </>
  );
}

function FilterBar({ lang, value, onChange, count }: { lang: Language; value: Filters; onChange: (f: Filters) => void; count: number | null }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const group = <K extends keyof Filters>(key: K, label: string, options: { value: Filters[K]; label: string }[]) => (
    <div className="studio-filter" role="group" aria-label={label}>
      <span className="studio-filter-label" aria-hidden>
        {label}
      </span>
      {options.map((o) => (
        <button
          key={o.value || 'all'}
          type="button"
          className={'chip' + (value[key] === o.value ? ' on' : '')}
          aria-pressed={value[key] === o.value}
          onClick={() => onChange({ ...value, [key]: o.value })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
  return (
    <div className="studio-filters">
      {group('kind', t('Type', 'Type'), [
        { value: '', label: t('Tout', 'All') },
        { value: 'image', label: t('Images', 'Images') },
        { value: 'video', label: t('Vidéos', 'Videos') },
      ])}
      {group('aspect', t('Format', 'Format'), [{ value: '', label: t('Tous', 'All') }, ...MEDIA_ASPECTS.map((a) => ({ value: a, label: a }))])}
      {group('cleared', t('Publication', 'Publication'), [
        { value: '', label: t('Tous', 'All') },
        { value: 'true', label: t('Autorisés', 'Cleared') },
        { value: 'false', label: t('Non autorisés', 'Not cleared') },
      ])}
      {count !== null && (
        <span className="studio-filter-count" aria-live="polite">
          {L ? `${count} fichier${count > 1 ? 's' : ''}` : `${count} file${count === 1 ? '' : 's'}`}
        </span>
      )}
    </div>
  );
}

type Busy = null | 'clear' | 'withdraw' | 'tags' | 'download';

function AssetCard({ asset, lang, onChange }: { asset: LibraryAsset; lang: Language; onChange: (a: LibraryAsset) => void }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const titleId = useId();
  const [busy, setBusy] = useState<Busy>(null);
  const [dialog, setDialogState] = useState<null | 'clear' | 'withdraw' | 'tags'>(null);
  const [error, setError] = useState<string | null>(null);
  // An error belongs to where it happened: the dialog while one is open, else the card.
  const setDialog = (d: typeof dialog) => {
    setError(null);
    setDialogState(d);
  };
  const [thumbFailed, setThumbFailed] = useState(false);

  async function patch(kind: Exclude<Busy, null | 'download'>, body: Record<string, unknown>): Promise<boolean> {
    setBusy(kind);
    setError(null);
    try {
      const res = await api<{ asset: MediaAssetDto }>(`/media/${asset.id}`, { method: 'PATCH', body });
      onChange({ ...res.asset, usage: asset.usage });
      // A clearance change can unblock (or block) a post's approval on Aujourd'hui.
      notifyStudioChanged();
      return true;
    } catch (err) {
      reportUnexpected(err, { action: `media-${kind}`, assetId: asset.id });
      setError(errorText(err, lang));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy('download');
    setError(null);
    try {
      await downloadMedia(asset.id);
    } catch (err) {
      reportUnexpected(err, { action: 'media-download', assetId: asset.id });
      setError(errorText(err, lang));
    } finally {
      setBusy(null);
    }
  }

  const used = asset.usage.approved + asset.usage.published + asset.usage.other;
  const video = asset.kind === 'video';
  const tall = asset.aspect === '9:16' || asset.aspect === '4:5';

  return (
    <article className={'card studio-asset' + (asset.cleared ? '' : ' is-uncleared')} aria-labelledby={titleId}>
      <div className={'studio-asset-preview' + (tall ? ' is-tall' : '')}>
        {!video && !thumbFailed ? (
          // Plain <img>: a private, short-lived presigned URL that next/image cannot optimise.
          <img src={mediaFileUrl(asset.id)} alt="" loading="lazy" onError={() => setThumbFailed(true)} />
        ) : (
          <span className="studio-asset-tile" aria-hidden>
            <AIcon name={video ? 'play' : 'eye'} size={26} />
            <span>{video ? t('Vidéo', 'Video') : t('Aperçu indisponible', 'No preview')}</span>
          </span>
        )}
        <span className={`badge ${asset.cleared ? 'ok' : 'warn'} studio-asset-badge`}>
          <i className="bdot" />
          {asset.cleared ? t('Autorisé', 'Cleared') : t('Non autorisé', 'Not cleared')}
        </span>
      </div>

      <div className="studio-asset-body">
        <h3 id={titleId} className="studio-asset-name">
          {asset.fileName}
        </h3>
        <p className="studio-asset-meta">
          {assetMeta(asset, lang)}
          {asset.language ? ` · ${LANGUAGE_LABEL[asset.language as 'fr' | 'en']?.[lang] ?? asset.language}` : ''}
        </p>
        <p className="studio-asset-meta">
          {t('Ajouté le ', 'Added on ')}
          {dateTime(asset.createdAt, lang)}
          {asset.origin === 'imported' && <span className="badge neutral studio-inline-badge">{t('Importé', 'Imported')}</span>}
        </p>
        {asset.clearanceNote && <p className="studio-asset-note">{asset.clearanceNote}</p>}
        {asset.tags.length > 0 && (
          <ul className="studio-tags" aria-label={t('Mots-clés', 'Tags')}>
            {asset.tags.map((tag) => (
              <li key={tag} className="chip static">
                {tag}
              </li>
            ))}
          </ul>
        )}
        <p className="studio-asset-usage">
          {used === 0
            ? t('Joint à aucun post', 'Not attached to any post')
            : L
              ? `Joint à ${used} post${used > 1 ? 's' : ''}${asset.usage.published ? ` · ${asset.usage.published} publié${asset.usage.published > 1 ? 's' : ''}` : ''}`
              : `Attached to ${used} post${used > 1 ? 's' : ''}${asset.usage.published ? ` · ${asset.usage.published} published` : ''}`}
        </p>
        {error && !dialog && <ErrorNotice lang={lang} message={error} />}
      </div>

      <div className="studio-actions" role="group" aria-label={t(`Actions sur ${asset.fileName}`, `Actions on ${asset.fileName}`)}>
        {asset.cleared ? (
          <button type="button" className="btn secondary" onClick={() => setDialog('withdraw')} disabled={busy !== null}>
            <AIcon name="x" />
            {t('Retirer l’autorisation', 'Withdraw clearance')}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => setDialog('clear')} disabled={busy !== null}>
            <AIcon name="check" />
            {t('Autoriser', 'Clear')}
          </button>
        )}
        <button type="button" className="btn secondary" onClick={() => setDialog('tags')} disabled={busy !== null}>
          <AIcon name="tag" />
          {t('Mots-clés', 'Tags')}
        </button>
        <button type="button" className="btn secondary" onClick={() => void download()} disabled={busy !== null}>
          <AIcon name="download" />
          {busy === 'download' ? t('Préparation…', 'Preparing…') : t('Télécharger', 'Download')}
        </button>
      </div>

      {dialog === 'clear' && (
        <ClearanceDialog
          lang={lang}
          asset={asset}
          clear
          busy={busy === 'clear'}
          onClose={() => setDialog(null)}
          onConfirm={async (note) => (await patch('clear', { cleared: true, ...(note ? { note } : {}) })) && setDialog(null)}
          error={error}
        />
      )}
      {dialog === 'withdraw' && (
        <ClearanceDialog
          lang={lang}
          asset={asset}
          clear={false}
          busy={busy === 'withdraw'}
          onClose={() => setDialog(null)}
          onConfirm={async (note) => (await patch('withdraw', { cleared: false, ...(note ? { note } : {}) })) && setDialog(null)}
          error={error}
        />
      )}
      {dialog === 'tags' && (
        <TagsDialog
          lang={lang}
          asset={asset}
          busy={busy === 'tags'}
          error={error}
          onClose={() => setDialog(null)}
          onSave={async (tags) => (await patch('tags', { tags })) && setDialog(null)}
        />
      )}
    </article>
  );
}

/** "Autoriser" (with an optional note) or "Retirer l'autorisation" (says which posts it touches). */
function ClearanceDialog({
  lang,
  asset,
  clear,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  lang: Language;
  asset: LibraryAsset;
  clear: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [note, setNote] = useState('');
  const { approved, published } = asset.usage;

  return (
    <Dialog
      title={clear ? t('Autoriser ce média ?', 'Clear this media?') : t('Retirer l’autorisation ?', 'Withdraw clearance?')}
      lang={lang}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            {t('Annuler', 'Cancel')}
          </button>
          <button type="submit" form={`${id}-form`} className={'btn' + (clear ? '' : ' danger')} disabled={busy}>
            {busy
              ? t('Enregistrement…', 'Saving…')
              : clear
                ? t('Autoriser la publication', 'Clear for publication')
                : t('Retirer l’autorisation', 'Withdraw clearance')}
          </button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        className="col gap16"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onConfirm(note.trim());
        }}
      >
        {clear ? (
          <p className="studio-dialog-text">
            {t(
              `« ${asset.fileName} » pourra être joint aux posts et publié. Vérifiez d’abord : aucun enfant reconnaissable, aucune donnée de test, et le droit de l’utiliser.`,
              `"${asset.fileName}" can then be attached to posts and published. Check first: no recognisable child, no test data, and the right to use it.`,
            )}
          </p>
        ) : (
          <>
            <p className="studio-dialog-text">
              {t(
                `« ${asset.fileName} » ne pourra plus être validé sur un post tant qu’il ne sera pas de nouveau autorisé.`,
                `"${asset.fileName}" can no longer be approved on a post until it is cleared again.`,
              )}
            </p>
            {approved > 0 && (
              <Notice tone="warn">
                <p>
                  {L
                    ? `Il est joint à ${approved > 1 ? `${approved} posts déjà validés. Ces posts restent validés` : 'un post déjà validé. Ce post reste validé'}, mais la carte signalera que le média n’est plus autorisé : remplacez-le ou retirez-le avant de publier.`
                    : `It is attached to ${approved > 1 ? `${approved} approved posts. They stay` : 'an approved post. It stays'} approved, but the card will say the media is no longer cleared: replace or remove it before publishing.`}
                </p>
              </Notice>
            )}
            {published > 0 && (
              <Notice tone="info">
                <p>
                  {L
                    ? `Il a déjà été publié (${published > 1 ? `${published} posts` : '1 post'}) : retirer l’autorisation ne le retire pas des réseaux sociaux.`
                    : `It was already published (${published > 1 ? `${published} posts` : '1 post'}): withdrawing clearance does not remove it from social networks.`}
                </p>
              </Notice>
            )}
          </>
        )}
        <div>
          <label className="field-label" htmlFor={`${id}-note`}>
            {clear ? t('Note (facultatif)', 'Note (optional)') : t('Raison (facultatif)', 'Reason (optional)')}
          </label>
          <textarea
            id={`${id}-note`}
            className="ta"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={clear ? t('ex. : tourné par nous, droits vérifiés', 'e.g. filmed by us, rights checked') : t('ex. : un enfant est reconnaissable', 'e.g. a child can be recognised')}
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

function TagsDialog({
  lang,
  asset,
  busy,
  error,
  onClose,
  onSave,
}: {
  lang: Language;
  asset: LibraryAsset;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (tags: string[]) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [text, setText] = useState(asset.tags.join(', '));
  const tags = parseTags(text);
  const problem = tagsError(tags, lang);
  return (
    <Dialog
      title={t('Mots-clés', 'Tags')}
      lang={lang}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            {t('Annuler', 'Cancel')}
          </button>
          <button type="submit" form={`${id}-form`} className="btn" disabled={busy || problem !== null}>
            {busy ? t('Enregistrement…', 'Saving…') : t('Enregistrer les mots-clés', 'Save tags')}
          </button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        className="col gap16"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !problem) onSave(tags);
        }}
      >
        <div>
          <label className="field-label" htmlFor={`${id}-tags`}>
            {t(`Mots-clés de « ${asset.fileName} »`, `Tags of "${asset.fileName}"`)}
          </label>
          <input id={`${id}-tags`} className="inp" value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="off" aria-invalid={problem !== null} aria-describedby={`${id}-help`} data-autofocus />
          <p id={`${id}-help`} className={problem ? 'studio-field-error' : 'help'}>
            {problem ?? t('Séparés par des virgules : module, niveau, thème… 10 au plus.', 'Comma-separated: module, level, theme… 10 at most.')}
          </p>
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
