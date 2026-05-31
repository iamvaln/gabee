import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

// SEO defaults for the public marketing surface. Per-route layouts override
// `title` (via the `%s · Gabee` template), `description`, and `alternates`.
// Auth-gated areas (/parent, /admin) override `robots` to noindex,nofollow.
// TODO(seo): drop a 1200x630 `og.png` and a 192x192 `icon-192.png` in
// `apps/web/public/` once the brand assets land — the references below
// already resolve relative to `metadataBase`.
const SITE_URL = 'https://gabee.app';
const DEFAULT_DESCRIPTION =
  "Gabee is a bilingual (FR/EN) learning tool for kids 6-10: numbers, words, translation, keyboard typing and first steps in code — free for up to 3 children.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Gabee — Apprendre les chiffres, mots, code et plus (FR/EN)',
    template: '%s · Gabee',
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: 'Gabee',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
  openGraph: {
    title: 'Gabee — Apprendre les chiffres, mots, code et plus (FR/EN)',
    description: DEFAULT_DESCRIPTION,
    type: 'website',
    locale: 'fr_FR',
    alternateLocale: ['en_US'],
    siteName: 'Gabee',
    url: SITE_URL,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Gabee' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gabee — Apprendre les chiffres, mots, code et plus (FR/EN)',
    description: DEFAULT_DESCRIPTION,
    images: ['/og.png'],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The same cookies the admin + parent pages read to pick the displayed
  // language: `admin_lang` for the admin shell, `parent_lang` for the parent
  // app. The html `lang` attribute must match so screen readers + the browser
  // hyphenation engine speak the right language.
  const c = await cookies();
  const adminLang = c.get('admin_lang')?.value;
  const parentLang = c.get('parent_lang')?.value;
  const lang = adminLang === 'en' || parentLang === 'en' ? 'en' : 'fr';
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;600;700;800;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
