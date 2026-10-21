import { MEDIA_ASPECTS, MEDIA_MAX_IMAGE_BYTES, MEDIA_MAX_TAGS, MEDIA_MAX_VIDEO_BYTES, type ContentPlatform, type Language, type MediaAspect } from '@gabee/types';
import type { LibraryAssetDto } from '@/lib/server/content-studio/media';
import type { Bi } from './format';

/** Labels and checks shared by the Médiathèque, the uploader and the post card's media picker. */

export type LibraryAsset = LibraryAssetDto;

export type UploadMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4';

export const ASPECT_LABEL: Record<MediaAspect, Bi> = {
  '16:9': { fr: '16:9 · paysage', en: '16:9 · landscape' },
  '9:16': { fr: '9:16 · vertical', en: '9:16 · vertical' },
  '1:1': { fr: '1:1 · carré', en: '1:1 · square' },
  '4:5': { fr: '4:5 · portrait', en: '4:5 · portrait' },
};
export { MEDIA_ASPECTS };

const BY_EXTENSION: Record<string, UploadMime> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4' };
const ALLOWED = new Set<string>(Object.values(BY_EXTENSION));

/**
 * The MIME type to declare (and sign) for `file`: the browser's own when it
 * is allowed, else from the extension (some systems leave `File.type` empty).
 */
export function uploadMime(file: File): UploadMime | null {
  if (ALLOWED.has(file.type)) return file.type as UploadMime;
  if (file.type !== '') return null;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[ext] ?? null;
}

/** "4,2 Mo" / "4.2 MB". */
export function fileSize(bytes: number, lang: Language): string {
  const L = lang === 'fr';
  const nf = (n: number) => new Intl.NumberFormat(L ? 'fr-FR' : 'en-GB', { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
  if (bytes < 1024 * 1024) return `${nf(Math.max(1, Math.round(bytes / 1024)))} ${L ? 'Ko' : 'KB'}`;
  return `${nf(bytes / (1024 * 1024))} ${L ? 'Mo' : 'MB'}`;
}

/** What is wrong with `file` before anything is sent (null: fine). */
export function checkFile(file: File, lang: Language): string | null {
  const L = lang === 'fr';
  const mime = uploadMime(file);
  if (!mime) {
    return L
      ? 'Ce type de fichier n’est pas accepté : choisissez une image PNG, JPEG ou WebP, ou une vidéo MP4.'
      : 'This file type is not accepted: pick a PNG, JPEG or WebP image, or an MP4 video.';
  }
  const video = mime === 'video/mp4';
  const cap = video ? MEDIA_MAX_VIDEO_BYTES : MEDIA_MAX_IMAGE_BYTES;
  if (file.size > cap) {
    return L
      ? `Ce fichier est trop lourd (${fileSize(file.size, lang)}) : ${video ? 'une vidéo' : 'une image'} fait au plus ${fileSize(cap, lang)}. Réduisez-le puis réessayez.`
      : `This file is too large (${fileSize(file.size, lang)}): ${video ? 'a video' : 'an image'} may be at most ${fileSize(cap, lang)}. Shrink it, then try again.`;
  }
  if (file.size === 0) return L ? 'Ce fichier est vide. Choisissez-en un autre.' : 'This file is empty. Pick another one.';
  return null;
}

/** "lecture, Soir , #code" → ["lecture", "soir", "code"]; the server stores the same normal form. */
export function parseTags(text: string): string[] {
  const tags = text
    .split(/[,;\n]+/)
    .map((t) => t.trim().replace(/^#+/, '').trim().toLocaleLowerCase('fr'))
    .filter(Boolean);
  return [...new Set(tags)];
}

export function tagsError(tags: string[], lang: Language): string | null {
  const L = lang === 'fr';
  if (tags.length > MEDIA_MAX_TAGS) return L ? `${MEDIA_MAX_TAGS} mots-clés au plus.` : `At most ${MEDIA_MAX_TAGS} tags.`;
  if (tags.some((t) => t.length > 40)) return L ? 'Chaque mot-clé fait 40 caractères au plus.' : 'Each tag is at most 40 characters.';
  return null;
}

/** The files a platform's post can take: TikTok, vertical videos; LinkedIn, any image or video. */
export function pickerFilter(platform: ContentPlatform): { kind?: 'video'; aspect?: MediaAspect } {
  return platform === 'tiktok' ? { kind: 'video', aspect: '9:16' } : {};
}

export function kindLabel(kind: string, lang: Language): string {
  if (kind === 'video') return lang === 'fr' ? 'Vidéo' : 'Video';
  return 'Image';
}

/** "Vidéo · 9:16 · 4,2 Mo" */
export function assetMeta(a: Pick<LibraryAsset, 'kind' | 'aspect' | 'sizeBytes' | 'width' | 'height'>, lang: Language): string {
  return [kindLabel(a.kind, lang), a.aspect, a.width && a.height ? `${a.width}×${a.height}` : null, fileSize(a.sizeBytes, lang)]
    .filter(Boolean)
    .join(' · ');
}
