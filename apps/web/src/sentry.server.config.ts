import * as Sentry from '@sentry/nextjs';

// Server-side Sentry init (Node runtime). DSN-gated: with no SENTRY_DSN the
// SDK initialises to a no-op — no network, no overhead — so local dev + CI +
// any deploy without the secret behave exactly as before. Set SENTRY_DSN in
// the environment (VPS .env.production) to turn error reporting on.
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  // Environment tag so prod / preview errors don't mix in the Sentry UI.
  environment: process.env.NODE_ENV,
  // Performance tracing: sample 10% of transactions in prod (tune later).
  // 0 disables tracing entirely, which is fine until we care about latency.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  // Don't spam breadcrumbs in dev logs.
  debug: false,
});
