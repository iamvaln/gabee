import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { routing, type Locale } from '@/lib/i18n/routing';
import './landing.css';

// Locale segment is statically rendered for the supported locales (`fr`, `en`).
// `force-static` keeps the landing as cached HTML; `generateStaticParams`
// emits one route per locale at build time.
export const dynamic = 'force-static';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const messages = (await import(`../../../messages/${locale}.json`)).default as {
    meta: { title: string; description: string; ogTitle?: string; ogDescription?: string };
  };
  const ogTitle = messages.meta.ogTitle ?? messages.meta.title;
  const ogDescription = messages.meta.ogDescription ?? messages.meta.description;
  // Override the root layout's `locale: 'fr_FR'` / `alternateLocale: ['en_US']`
  // per route so the OG card matches the actual page language. Also declare
  // hreflang siblings via `alternates.languages` so Google and Bing serve the
  // right localized landing to the right audience.
  const ogLocale = locale === 'en' ? 'en_US' : 'fr_FR';
  const alternateLocale = locale === 'en' ? ['fr_FR'] : ['en_US'];
  return {
    title: messages.meta.title,
    description: messages.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        fr: '/fr',
        en: '/en',
        'x-default': '/fr',
      },
    },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: 'website',
      locale: ogLocale,
      alternateLocale,
      siteName: 'Gabee',
      url: `/${locale}`,
      images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Gabee' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription,
      images: ['/og.png'],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const typedLocale: Locale = locale;
  const messages = await getMessages({ locale: typedLocale });

  return (
    <NextIntlClientProvider locale={typedLocale} messages={messages}>
      <div className="landing">{children}</div>
    </NextIntlClientProvider>
  );
}
