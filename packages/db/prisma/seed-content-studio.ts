import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AGENT_KEYS, type AgentKey, type AiCapability, type AiTask, type ContentPlatform } from '@gabee/types';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';

/**
 * Content Studio seed (spec 2026-10-20, plan Task 2). CREATE-ONLY: every write
 * is an upsert with an empty `update`, so a re-seed inserts what is missing and
 * never overwrites what a super-admin changed (settings, prices, routes,
 * profiles, editorial line, agent versions).
 *
 * Called from `seed.ts` `main()` and re-exported by `@gabee/db/testing`.
 */

// ── AI model catalogue + default routes ──
// The only place model ids and prices appear: business code reads them from
// `ai_models` / `ai_task_routes`.
export const AI_MODEL_SEED: readonly {
  key: string;
  provider: string;
  capabilities: readonly AiCapability[];
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}[] = [
  { key: 'claude-opus-5-5', provider: 'anthropic', capabilities: ['text', 'vision'], inputUsdPerMTok: 4, outputUsdPerMTok: 20 },
  { key: 'claude-sonnet-5-5', provider: 'anthropic', capabilities: ['text', 'vision'], inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  { key: 'claude-haiku-5-5', provider: 'anthropic', capabilities: ['text', 'vision'], inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5 },
];

/** One rank-1 route per text task. Vision / image / video tasks stay unrouted
 *  (disabled) until their phase. */
export const AI_ROUTE_SEED: readonly {
  task: AiTask;
  rank: number;
  modelKey: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxTokens: number;
}[] = [
  { task: 'content_strategy', rank: 1, modelKey: 'claude-opus-5-5', effort: 'high', maxTokens: 16000 },
  { task: 'content_titles', rank: 1, modelKey: 'claude-opus-5-5', effort: 'high', maxTokens: 16000 },
  { task: 'post_linkedin', rank: 1, modelKey: 'claude-opus-5-5', effort: 'medium', maxTokens: 8000 },
  { task: 'post_tiktok', rank: 1, modelKey: 'claude-opus-5-5', effort: 'medium', maxTokens: 8000 },
  { task: 'art_direction', rank: 1, modelKey: 'claude-opus-5-5', effort: 'low', maxTokens: 4000 },
  { task: 'report_narrative', rank: 1, modelKey: 'claude-opus-5-5', effort: 'medium', maxTokens: 8000 },
];

// ── Platform profiles ──
export const TIKTOK_BIO_LINK = 'https://gabee.app/fr?utm_source=tiktok&utm_medium=social&utm_content=bio';

/** Where the owner posts (« Copier et ouvrir »), changeable in Réglages. LinkedIn:
 *  the Gabee company page's post composer (owner, 2026-10-26); TikTok: TikTok
 *  Studio's upload page (no caption prefill exists). Same values as the
 *  migration that added the column. */
export const LINKEDIN_PUBLISH_URL = 'https://www.linkedin.com/company/109660238/admin/page-posts/published/?share=true';
export const TIKTOK_PUBLISH_URL = 'https://www.tiktok.com/tiktokstudio/upload';

export const PLATFORM_PROFILE_SEED: readonly {
  platform: ContentPlatform;
  objective: string;
  tone: string;
  rules: {
    max_chars: number;
    hashtags_min: number;
    hashtags_max: number;
    link_policy: 'in_body' | 'bio_only';
    emoji_policy: string;
  };
  mediaAspect: '16:9' | '1:1' | '9:16';
  bioLink: string | null;
  publishUrl: string | null;
}[] = [
  {
    platform: 'linkedin',
    objective: 'crédibilité, partenaires, inscriptions des parents',
    tone: "Posé, concret et bienveillant. On s'adresse à des parents, enseignants et partenaires : phrases courtes, exemples précis, pas de superlatifs.",
    rules: { max_chars: 3000, hashtags_min: 3, hashtags_max: 5, link_policy: 'in_body', emoji_policy: 'Au plus 2 emojis, jamais en début de phrase.' },
    mediaAspect: '16:9',
    bioLink: null,
    publishUrl: LINKEDIN_PUBLISH_URL,
  },
  {
    platform: 'tiktok',
    objective: 'notoriété auprès des parents',
    tone: 'Chaleureux, vivant et ludique, sans être enfantin envers les parents. Une idée par vidéo, accroche dans les 3 premières secondes.',
    rules: { max_chars: 2200, hashtags_min: 3, hashtags_max: 6, link_policy: 'bio_only', emoji_policy: 'Emojis permis avec mesure (3 au plus).' },
    mediaAspect: '9:16',
    bioLink: TIKTOK_BIO_LINK,
    publishUrl: TIKTOK_PUBLISH_URL,
  },
];

// ── Editorial line v1 ──
// Product facts come ONLY from the landing copy (apps/web/messages/fr.json:
// hero, modules, pricing, faq). `paid_offer` stays null until the owner fills it.
export const EDITORIAL_LINE_V1 = {
  version: 1,
  productFacts: {
    ages: { min: 6, max: 10 },
    modules: [
      { key: 'words', name_fr: 'Mots', name_en: 'Words', what: 'Vocabulaire, lecture, phrases.' },
      { key: 'numbers', name_fr: 'Nombres', name_en: 'Numbers', what: 'Compter, additionner, soustraire.' },
      { key: 'keyboard', name_fr: 'Clavier', name_en: 'Keyboard', what: 'Apprendre à taper, doucement.' },
      { key: 'code', name_fr: 'Code', name_en: 'Code', what: 'Premiers pas de programmation.' },
      { key: 'translation', name_fr: 'Traduction', name_en: 'Translation', what: "Passer du français à l'anglais et retour." },
    ],
    languages: ['fr', 'en'],
    language_choice: "L'enfant choisit sa langue (français ou anglais) au début de chaque session.",
    free_tier: { price: '0 FCFA', max_children: 3 },
    paid_offer: null,
    other_facts: [
      "La progression s'adapte au niveau de l'enfant.",
      "L'app enfant fonctionne entièrement hors-ligne ; les données se synchronisent quand la connexion revient.",
      'Limites de session intégrées et suivi du temps dans le tableau de bord parent.',
      "Un co-parent peut être invité par email depuis les réglages.",
      'Les données de l’enfant ne sont vues que par le parent (et le co-parent invité) : pas de publicitaires, pas de tiers.',
      'Suppression du compte depuis les réglages ; tout est supprimé sous 30 jours.',
    ],
  },
  body: `# Ligne éditoriale Gabee — v1

## Qui est Gabee
Gabee est un outil d'apprentissage pour les enfants de 6 à 10 ans : vocabulaire,
calcul, logique du code, frappe au clavier — en français et en anglais. Sa mascotte
est une abeille. Promesse : « Garder l'esprit vif. Construire les compétences qui
comptent. »

## Public
- Les parents d'enfants de 6 à 10 ans (cible principale des inscriptions).
- Les enseignants et les écoles.
- Les partenaires potentiels (éducation, associations, entreprises).

## Ton
Chaleureux, clair et honnête. On parle aux adultes comme à des adultes : phrases
courtes, mots simples, exemples concrets tirés de ce que l'enfant fait dans Gabee.
Pas de jargon, pas de superlatifs, pas de promesses de résultats.

## À faire
- Montrer un moment de jeu réel (un module, un exercice) plutôt qu'affirmer.
- Valoriser l'apprentissage dans les deux langues.
- Rassurer sur ce que Gabee fait vraiment : gratuit jusqu'à 3 enfants, hors-ligne,
  limites de session, données protégées.
- Citer la source de toute information extérieure, résumée avec nos mots.

## À éviter
- Montrer, nommer ou faire parler un enfant réel. Personnages autorisés : Gabee
  l'abeille et des personnages adultes ou animaux inventés.
- Inventer des chiffres, des témoignages, des citations, des études ou des partenaires.
- Annoncer une offre payante, un prix ou une fonctionnalité absents des faits produit.
- Copier le texte ou les images d'un article.
- Comparer Gabee à d'autres applications nommées.

## Vocabulaire
- On dit « votre enfant » aux parents ; Gabee s'écrit toujours avec une majuscule.
- Noms des modules : Mots, Nombres, Clavier, Code, Traduction (en anglais : Words,
  Numbers, Keyboard, Code, Translation).

## Faits produit
Les seuls faits sur Gabee que les agents peuvent affirmer sont dans le bloc
structuré « faits produit » de cette version. Un fait absent ou vide (comme l'offre
payante) ne doit pas être mentionné.
`,
} as const;

// ── Agent instructions ──
const AGENTS_DIR = new URL('./content-studio/agents/', import.meta.url);

/** Absolute path of the instruction file for an agent. */
export function agentInstructionsPath(key: AgentKey): string {
  return fileURLToPath(new URL(`${key}.md`, AGENTS_DIR));
}

export function loadAgentInstructions(key: AgentKey): string {
  return readFileSync(agentInstructionsPath(key), 'utf8');
}

/** Recipients default: the comma-separated `ADMIN_DIGEST_TO`, else none (the
 *  notification layer then falls back to the app's own default). */
function defaultRecipients(): string[] {
  return (process.env.ADMIN_DIGEST_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function seedContentStudio(prisma: PrismaClient): Promise<void> {
  const now = new Date();

  await prisma.studioSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', recipients: defaultRecipients() },
  });

  for (const m of AI_MODEL_SEED) {
    await prisma.aiModel.upsert({
      where: { key: m.key },
      update: {},
      create: { ...m, capabilities: [...m.capabilities], enabled: true },
    });
  }

  for (const r of AI_ROUTE_SEED) {
    await prisma.aiTaskRoute.upsert({
      where: { task_rank: { task: r.task, rank: r.rank } },
      update: {},
      create: { ...r },
    });
  }

  for (const p of PLATFORM_PROFILE_SEED) {
    await prisma.platformProfile.upsert({
      where: { platform: p.platform },
      update: {},
      create: { ...p, rules: p.rules as Prisma.InputJsonValue },
    });
  }

  await prisma.editorialLineVersion.upsert({
    where: { version: EDITORIAL_LINE_V1.version },
    update: {},
    create: {
      version: EDITORIAL_LINE_V1.version,
      body: EDITORIAL_LINE_V1.body,
      productFacts: EDITORIAL_LINE_V1.productFacts as unknown as Prisma.InputJsonValue,
      publishedAt: now,
    },
  });

  for (const key of AGENT_KEYS) {
    const instructions = loadAgentInstructions(key);
    await prisma.agent.upsert({ where: { key }, update: {}, create: { key } });
    const v1 = await prisma.agentVersion.upsert({
      where: { agentKey_version: { agentKey: key, version: 1 } },
      update: {},
      create: { agentKey: key, version: 1, instructions, settings: {}, publishedAt: now },
    });
    // Publish v1 only when nothing is published yet — never replace a version
    // a super-admin published since.
    await prisma.agent.updateMany({
      where: { key, publishedVersionId: null },
      data: { publishedVersionId: v1.id },
    });
  }
}
