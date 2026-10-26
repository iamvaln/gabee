import type { BilingualText, ContentLanguage, ContentPlatform, Language, LinkedInPost, SlotFormat, TikTokPost } from '@gabee/types';
import type { DraftDto } from '@/lib/server/content-studio/drafts';

/** Labels and formatting shared by the Aujourd'hui and Semaine screens. */

/** French / English copy: the shared `BilingualText` contract (one type across the admin). */
export type Bi = BilingualText;

export const PLATFORM_LABEL: Record<ContentPlatform, string> = { linkedin: 'LinkedIn', tiktok: 'TikTok' };

export const LANGUAGE_LABEL: Record<ContentLanguage, Bi> = {
  fr: { fr: 'français', en: 'French' },
  en: { fr: 'anglais', en: 'English' },
};

export const FORMAT_LABEL: Record<SlotFormat, Bi> = {
  text: { fr: 'Texte', en: 'Text' },
  visual: { fr: 'Visuel', en: 'Visual' },
  gameplay_video: { fr: 'Vidéo de jeu', en: 'Gameplay video' },
  presentation_video: { fr: 'Vidéo de présentation', en: 'Presentation video' },
  story: { fr: 'Story', en: 'Story' },
};

/** Badge tone + words for a draft status (the badge always carries text, never colour alone). */
export const DRAFT_STATUS: Record<string, { tone: string; label: Bi }> = {
  generating: { tone: 'info', label: { fr: 'En rédaction', en: 'Being written' } },
  ready: { tone: 'warn', label: { fr: 'Prêt à valider', en: 'Ready to approve' } },
  approved: { tone: 'ok', label: { fr: 'Validé', en: 'Approved' } },
  published: { tone: 'ok', label: { fr: 'Publié', en: 'Published' } },
  failed: { tone: 'bad', label: { fr: 'Échec', en: 'Failed' } },
  /** UI-only: `generating` whose run died (no live lock). */
  interrupted: { tone: 'bad', label: { fr: 'Interrompu', en: 'Interrupted' } },
  stale: { tone: 'neutral', label: { fr: 'À revoir', en: 'Needs review' } },
};

export const SLOT_STATUS: Record<string, { tone: string; label: Bi }> = {
  proposed: { tone: 'neutral', label: { fr: 'Proposé', en: 'Proposed' } },
  validated: { tone: 'info', label: { fr: 'Validé', en: 'Validated' } },
  drafting: { tone: 'info', label: { fr: 'En rédaction', en: 'Being written' } },
  drafted: { tone: 'warn', label: { fr: 'Brouillons prêts', en: 'Drafts ready' } },
  done: { tone: 'ok', label: { fr: 'Publié', en: 'Published' } },
  skipped: { tone: 'neutral', label: { fr: 'Sauté', en: 'Skipped' } },
};

const locale = (lang: Language) => (lang === 'fr' ? 'fr-FR' : 'en-GB');
const utc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

/** "mercredi 21 octobre" */
export function longDay(ymd: string, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utc(ymd));
}

/** "21 octobre" */
export function dayMonth(ymd: string, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utc(ymd));
}

/** { weekday: "lun.", day: "26" } for the day lines. */
export function dayParts(ymd: string, lang: Language): { weekday: string; day: string } {
  const d = utc(ymd);
  return {
    weekday: new Intl.DateTimeFormat(locale(lang), { weekday: 'short', timeZone: 'UTC' }).format(d),
    day: String(d.getUTCDate()),
  };
}

/** "octobre 2026" (French, inside a sentence) / "October 2026" for `YYYY-MM`. */
export function monthName(ym: string, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(`${ym}-01`));
}

/** "21 oct. à 14:02" in the viewer's clock (an instant, not a studio day). */
export function dateTime(iso: string, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function addDaysYmd(ymd: string, n: number): string {
  return new Date(utc(ymd).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return utc(ymd).getUTCDay();
}

/**
 * The post exactly as the owner pastes it: LinkedIn body (it already ends
 * with the tracked link) or TikTok caption, then the hashtags. The card
 * preview shows this same text, so what you see is what you copy.
 */
export function postText(draft: DraftDto): string {
  const p = draft.payload;
  if (!p) return '';
  const text = draft.platform === 'linkedin' ? (p as LinkedInPost).body : (p as TikTokPost).caption;
  const tags = p.hashtags.join(' ');
  return tags ? `${text.trimEnd()}\n\n${tags}` : text;
}
