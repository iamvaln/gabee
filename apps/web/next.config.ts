import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Workspace TS packages are transpiled by Next (they ship source, not built dist).
  transpilePackages: ['@gabee/types', '@gabee/db'],
  // `pg` is server-only and shouldn't be bundled.
  serverExternalPackages: ['pg'],
};

// `next-intl/plugin` wires `i18n.ts` to the server-side request configuration.
const withNextIntl = createNextIntlPlugin('./i18n.ts');

// Source-map upload to Sentry needs SENTRY_AUTH_TOKEN (+ org/project) at BUILD
// time. When they're absent (local dev, CI without the secret) we skip the
// Sentry build wrapper entirely — runtime error reporting still works via the
// DSN, only the stack-trace de-minification is missing. This keeps `next build`
// green everywhere without a Sentry account wired.
const sentryConfigured =
  !!process.env.SENTRY_AUTH_TOKEN &&
  !!process.env.SENTRY_ORG &&
  !!process.env.SENTRY_PROJECT;

const base = withNextIntl(nextConfig);

export default sentryConfigured
  ? withSentryConfig(base, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Quiet the plugin's own logs in CI.
      silent: true,
      // Upload source maps then delete them so they're not served publicly.
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : base;
