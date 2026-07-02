import * as Sentry from '@sentry/nextjs';

// Edge runtime Sentry init (middleware / edge routes). Same DSN-gating as the
// server config — no DSN → no-op.
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  debug: false,
});
