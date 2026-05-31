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
    meta: { title: string; description: string };
  };
  return { title: messages.meta.title, description: messages.meta.description };
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
