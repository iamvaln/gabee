import { redirect } from 'next/navigation';
import { routing } from '@/lib/i18n/routing';

// The marketing landing lives under `[locale]/`. The next-intl middleware in
// `src/proxy.ts` normally rewrites `/` → `/{defaultLocale}`, but with
// `localePrefix: 'always'` we still need a real route here as a fallback for
// direct hits (e.g. crawlers that bypass the middleware) and during static
// generation.
export default function RootPage(): never {
  redirect(`/${routing.defaultLocale}`);
}
