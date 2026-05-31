import { setRequestLocale } from 'next-intl/server';
import { TopBar } from '@/components/landing/TopBar';
import { Hero } from '@/components/landing/Hero';
import { Modules } from '@/components/landing/Modules';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Values } from '@/components/landing/Values';
import { Pricing } from '@/components/landing/Pricing';
import { FAQ } from '@/components/landing/FAQ';
import { Contact } from '@/components/landing/Contact';
import { Footer } from '@/components/landing/Footer';
import { hasLocale } from 'next-intl';
import { routing } from '@/lib/i18n/routing';
import { notFound } from 'next/navigation';

// Gabee public landing (LP1–LP8). One long-scroll page assembled from the
// section components in `@/components/landing`. All copy comes from
// `messages/{fr,en}.json` via `useTranslations()` inside each section.

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <>
      <TopBar />
      <main>
        <Hero />
        <Modules />
        <HowItWorks />
        <Values />
        <Pricing />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
