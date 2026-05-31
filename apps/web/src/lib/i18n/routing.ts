import { defineRouting } from 'next-intl/routing';

// Landing routing: FR is default, EN is alternate. Locale prefix is `always`
// so the root path can route to a static redirect (`/` → `/fr`) without
// conflicting with the existing non-localised admin/parent app surfaces.
// Localised paths: `/fr`, `/en`, `/fr/terms`, `/en/terms`, `/fr/privacy`, `/en/privacy`.
export const routing = defineRouting({
  locales: ['fr', 'en'] as const,
  defaultLocale: 'fr',
  localePrefix: 'always',
  localeCookie: { name: 'NEXT_LOCALE' },
});

export type Locale = (typeof routing.locales)[number];
