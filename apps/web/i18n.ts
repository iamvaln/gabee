import { getRequestConfig } from 'next-intl/server';
import { routing } from './src/lib/i18n/routing';

// next-intl request configuration. Called by next-intl/server APIs to load
// the messages bundle for the current request locale. The `[locale]` segment
// in the App Router supplies `requestLocale`; we validate it against the
// supported set and fall back to FR (the default).
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && (routing.locales as readonly string[]).includes(requested)
      ? requested
      : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
