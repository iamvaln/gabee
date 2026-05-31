import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gabee',
  description: 'A bilingual (FR/EN), desktop-first learning tool for children ~6-8.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
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
