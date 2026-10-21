import type { Language } from '@gabee/types';
import { ApiError } from './api';
import type { Bi } from './format';

/**
 * Plain-words error copy for the studio screens, by API error `code`. Shared
 * server messages (validation, auth) are English and generic, so they are
 * never shown as is. Studio messages that are already French and specific to
 * the case (a state that just changed, a week that exists, the English
 * minimum with its counts…) are shown as sent when the admin reads French.
 */

const COPY: Record<string, Bi> = {
  network: {
    fr: 'Le serveur ne répond pas. Vérifiez votre connexion internet puis réessayez.',
    en: 'The server is not answering. Check your internet connection, then try again.',
  },
  unauthorized: {
    fr: 'Votre session a expiré. Reconnectez-vous puis recommencez.',
    en: 'Your session has expired. Sign in again, then retry.',
  },
  session_stale: {
    fr: 'Votre session a expiré. Reconnectez-vous puis recommencez.',
    en: 'Your session has expired. Sign in again, then retry.',
  },
  forbidden: {
    fr: "Votre compte n'a pas le droit de faire cette action. Demandez-la à un super-admin.",
    en: 'Your account is not allowed to do this. Ask a super-admin.',
  },
  validation_error: {
    fr: "Certaines informations sont invalides. Vérifiez les champs puis réessayez.",
    en: 'Some information is invalid. Check the fields, then try again.',
  },
  invalid_json: {
    fr: "La demande n'a pas pu être lue. Rechargez la page puis réessayez.",
    en: 'The request could not be read. Reload the page, then try again.',
  },
  rate_limited: {
    fr: 'Trop de demandes en peu de temps. Patientez une minute puis réessayez.',
    en: 'Too many requests in a short time. Wait a minute, then try again.',
  },
  language_quota: {
    fr: "Pas assez de posts en anglais cette semaine. Passez d'autres jours en anglais, ou cochez « Valider quand même ».",
    en: 'Not enough English posts this week. Switch more days to English, or tick "Validate anyway".',
  },
  generation_in_progress: {
    fr: 'Gabee travaille déjà dessus. Attendez la fin, puis rechargez la page.',
    en: 'Gabee is already working on this. Wait for it to finish, then reload the page.',
  },
  ai_unavailable: {
    fr: "Le service d'IA est indisponible pour le moment. Rien n'a été perdu : réessayez dans quelques minutes.",
    en: 'The AI service is unavailable right now. Nothing was lost: try again in a few minutes.',
  },
  ai_refused: {
    fr: "L'IA a refusé de traiter cette demande. Reformulez le sujet ou la précision, puis réessayez.",
    en: 'The AI refused this request. Rephrase the topic or the note, then try again.',
  },
  ai_invalid_output: {
    fr: "L'IA a répondu avec un résultat inutilisable, même après une nouvelle tentative. Réessayez dans un instant.",
    en: 'The AI answered with an unusable result, even after a retry. Try again in a moment.',
  },
  storage_unavailable: {
    fr: "Le stockage des médias ne répond pas. Réessayez dans quelques minutes ; si cela se répète, prévenez l'équipe technique.",
    en: 'Media storage is not answering. Try again in a few minutes; if it keeps happening, tell the tech team.',
  },
  video_required: {
    fr: 'Un post TikTok est une vidéo : joignez une vidéo autorisée de la Médiathèque, puis validez.',
    en: 'A TikTok post is a video: attach a cleared video from the Media library, then approve.',
  },
  media_not_cleared: {
    fr: "Le fichier joint n'est pas autorisé à la publication. Autorisez-le dans la Médiathèque ou retirez-le.",
    en: 'The attached file is not cleared for publication. Clear it in the Media library or remove it.',
  },
  invalid_transition: {
    fr: "Cet élément vient de changer. Rechargez la page pour voir son état actuel.",
    en: 'This item just changed. Reload the page to see its current state.',
  },
  week_exists: {
    fr: "Cette semaine existe déjà. Ouvrez-la depuis l'écran Semaine.",
    en: 'This week already exists. Open it from the Week screen.',
  },
  not_ready: {
    fr: "Ce fichier n'est pas encore prêt. Réessayez dans un instant.",
    en: 'This file is not ready yet. Try again in a moment.',
  },
  no_media: {
    fr: "Ce brouillon n'a pas de média joint.",
    en: 'This draft has no attached media.',
  },
  conflict: {
    fr: "Quelqu'un vient de faire la même modification. Rechargez la page puis réessayez.",
    en: 'Someone just made the same change. Reload the page, then try again.',
  },
  invalid_post: {
    fr: 'Ce texte ne respecte pas les règles de la plateforme (longueur, hashtags ou lien). Corrigez-le puis enregistrez.',
    en: "This text breaks the platform's rules (length, hashtags or link). Fix it, then save.",
  },
  invalid_platforms: {
    fr: 'Chaque plateforme ne peut apparaître qu’une fois, et doit être activée. Corrigez la liste puis enregistrez.',
    en: 'Each platform may appear once and must be enabled. Fix the list, then save.',
  },
  platform_not_planned: {
    fr: "Cette plateforme n'est plus prévue ce jour-là. Ajoutez-la au jour dans l'écran Semaine.",
    en: 'This platform is no longer planned that day. Add it back to the day on the Week screen.',
  },
};

const FALLBACK: Bi = {
  fr: "Une erreur inattendue est survenue. Réessayez ; si cela se répète, rechargez la page et prévenez l'équipe technique.",
  en: 'Something unexpected went wrong. Try again; if it keeps happening, reload the page and tell the tech team.',
};

/** Codes whose French server message is specific to the case (counts, dates, states). */
const SERVER_FR = new Set([
  'invalid_transition',
  'week_exists',
  'language_quota',
  'generation_in_progress',
  'week_not_found',
  'slot_not_found',
  'draft_not_found',
  'not_found',
  'no_media',
  'platform_not_planned',
]);

/**
 * What to tell the admin about `err`. `overrides` gives screen-specific copy
 * for a code (e.g. a bad post URL in the publish dialog).
 */
export function errorText(err: unknown, lang: Language, overrides: Record<string, Bi> = {}): string {
  if (!(err instanceof ApiError)) return FALLBACK[lang];
  const own = overrides[err.code];
  if (own) return own[lang];
  if (lang === 'fr' && SERVER_FR.has(err.code) && err.message) return err.message;
  if (err.status === 404) {
    return lang === 'fr'
      ? "Cet élément n'existe plus. Rechargez la page."
      : 'This item no longer exists. Reload the page.';
  }
  return (COPY[err.code] ?? FALLBACK)[lang];
}

/**
 * A long AI call whose answer never arrived (connection cut, timeout, proxy
 * error): the server may still be working, so nothing is retried for now.
 */
export function unknownOutcomeText(lang: Language): string {
  return lang === 'fr'
    ? 'La connexion a été coupée ; Gabee continue peut-être. Cette page se met à jour toute seule.'
    : 'The connection was cut; Gabee may still be working. This page updates by itself.';
}
