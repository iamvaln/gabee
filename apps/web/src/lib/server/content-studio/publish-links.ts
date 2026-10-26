import { CONTENT_PLATFORMS, PUBLISH_URL_HOSTS, PUBLISH_URL_MAX, publishUrlProblem, type ContentPlatform, type PublishLinksUpdate, type PublishUrlProblem } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { auditContent } from './drafts';
import type { Actor } from './state';

/**
 * « Copier et ouvrir » (Aujourd'hui): where the owner posts each platform,
 * `PlatformProfile.publishUrl`. Set in Réglages by a super-admin (the route
 * enforces it); every admin reads it. A link is https on the platform's own
 * host (`publishUrlProblem`); null means none yet. Each change is audited.
 */

export type PublishLinks = Record<ContentPlatform, string | null>;

/** What the Aujourd'hui board adds for its publish buttons. */
export type PublishContext = {
  publish_links: PublishLinks;
  /** A super-admin may set a missing link in Réglages (the card links there). */
  can_edit_settings: boolean;
};

const NAME: Record<ContentPlatform, string> = { linkedin: 'LinkedIn', tiktok: 'TikTok' };

function problemMessage(platform: ContentPlatform, problem: PublishUrlProblem): string {
  const name = NAME[platform];
  switch (problem) {
    case 'not_url':
      return `Le lien ${name} n'est pas une adresse web. Collez l'adresse complète, qui commence par https://.`;
    case 'not_https':
      return `Le lien ${name} doit commencer par https://.`;
    case 'wrong_host':
      return `Le lien ${name} doit ouvrir ${PUBLISH_URL_HOSTS[platform].at(-1)} (https://${PUBLISH_URL_HOSTS[platform].at(-1)}/…).`;
    case 'too_long':
      return `Le lien ${name} est trop long (${PUBLISH_URL_MAX} caractères au plus).`;
  }
}

export async function getPublishLinks(): Promise<PublishLinks> {
  const rows = await prisma.platformProfile.findMany({ select: { platform: true, publishUrl: true } });
  const links = Object.fromEntries(CONTENT_PLATFORMS.map((p) => [p, null])) as PublishLinks;
  for (const r of rows) if ((CONTENT_PLATFORMS as readonly string[]).includes(r.platform)) links[r.platform as ContentPlatform] = r.publishUrl;
  return links;
}

/** Save the links named in `patch` (an empty string or null clears one). 422 `invalid_publish_url` refuses the whole change. */
export async function updatePublishLinks(patch: PublishLinksUpdate, actor: Actor): Promise<PublishLinks> {
  const next: Partial<PublishLinks> = {};
  for (const platform of CONTENT_PLATFORMS) {
    const raw = patch[platform];
    if (raw === undefined) continue;
    const value = raw?.trim() || null;
    if (value !== null) {
      const problem = publishUrlProblem(platform, value);
      if (problem) throw new HttpError(422, 'invalid_publish_url', problemMessage(platform, problem), { platform, problem });
    }
    next[platform] = value;
  }
  const before = await getPublishLinks();
  const changed = CONTENT_PLATFORMS.filter((p) => p in next && next[p] !== before[p]);
  await prisma.$transaction(changed.map((p) => prisma.platformProfile.update({ where: { platform: p }, data: { publishUrl: next[p] ?? null } })));
  for (const p of changed) {
    await auditContent(actor, 'content.publish_link.update', 'platform_profile', p, { before: before[p], after: next[p] ?? null });
  }
  return { ...before, ...next };
}
