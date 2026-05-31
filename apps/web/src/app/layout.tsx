import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gabee',
  description: 'A bilingual (FR/EN), desktop-first learning tool for children ~6-8.',
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
