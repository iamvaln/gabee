import type { MetadataRoute } from 'next';
import { routing } from '@/lib/i18n/routing';

// Next emits this at `/sitemap.xml`. We list the two localized landings
// (`/fr`, `/en`) plus their per-locale legal pages. The bare `/` redirects to
// `/fr` so we skip it here to avoid duplicate-content signals — Google will
// follow the 308 and pick the right canonical anyway.
const SITE_URL = 'https://gabee.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of routing.locales) {
    const languages: Record<string, string> = {};
    for (const other of routing.locales) {
      languages[other] = `${SITE_URL}/${other}`;
    }
    entries.push({
      url: `${SITE_URL}/${locale}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 1.0,
      alternates: { languages },
    });
    for (const path of ['privacy', 'terms'] as const) {
      const legalLanguages: Record<string, string> = {};
      for (const other of routing.locales) {
        legalLanguages[other] = `${SITE_URL}/${other}/${path}`;
      }
      entries.push({
        url: `${SITE_URL}/${locale}/${path}`,
        lastModified: now,
        changeFrequency: 'yearly',
        priority: 0.3,
        alternates: { languages: legalLanguages },
      });
    }
  }
  return entries;
}
