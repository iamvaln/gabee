import type { AgentKey, AiTask } from '@gabee/types';

/**
 * Plain names for AI tasks, authoring purposes and Communication agents,
 * shared by the Ops "Usage IA" page and the studio's Journal. No hooks: works
 * in server and client components.
 */

type Bi = { fr: string; en: string };

export const AI_TASK_LABEL: Record<AiTask | 'plan_generation' | 'question_generation', Bi> = {
  content_strategy: { fr: 'Directions de la semaine', en: 'Weekly directions' },
  content_titles: { fr: 'Titres de la semaine', en: 'Weekly titles' },
  post_linkedin: { fr: 'Posts LinkedIn', en: 'LinkedIn posts' },
  post_tiktok: { fr: 'Posts TikTok', en: 'TikTok posts' },
  art_direction: { fr: 'Choix des médias', en: 'Media choice' },
  report_narrative: { fr: 'Bilan de la semaine', en: 'Weekly report' },
  stats_from_screenshot: { fr: 'Lecture de statistiques', en: 'Stats from screenshots' },
  image_generation: { fr: "Création d'images", en: 'Image generation' },
  video_generation: { fr: 'Création de vidéos', en: 'Video generation' },
  plan_generation: { fr: 'Génération de plans', en: 'Plan generation' },
  question_generation: { fr: 'Génération de questions', en: 'Question generation' },
};

export function aiTaskLabel(key: string, lang: 'fr' | 'en'): string {
  return (AI_TASK_LABEL as Record<string, Bi>)[key]?.[lang] ?? key;
}

export const AGENT_LABEL: Record<AgentKey, Bi> = {
  strategist: { fr: 'Stratège', en: 'Strategist' },
  writer_linkedin: { fr: 'Rédacteur LinkedIn', en: 'LinkedIn writer' },
  writer_tiktok: { fr: 'Rédacteur TikTok', en: 'TikTok writer' },
  art_director: { fr: 'Directeur artistique', en: 'Art director' },
  analyst: { fr: 'Analyste', en: 'Analyst' },
};

export function agentLabel(key: string, lang: 'fr' | 'en'): string {
  return (AGENT_LABEL as Record<string, Bi>)[key]?.[lang] ?? key;
}

/** "0,0312 $" / "$0.0312": 2 to 4 decimals, so a cent-fraction run is not shown as 0,00 $. */
export function usd(n: number, lang: 'fr' | 'en'): string {
  const digits = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
  return lang === 'fr' ? `${digits}\u00a0$` : `$${digits}`;
}
