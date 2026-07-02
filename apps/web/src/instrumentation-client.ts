import * as Sentry from '@sentry/nextjs';

// Client-side Sentry init (browser). Next.js 15.3+/16 loads this file
// automatically. Uses the PUBLIC DSN (inlined into the client bundle) —
// separate var from the server SENTRY_DSN so we never leak a server-only
// secret to the browser, though Sentry DSNs are safe to expose by design.
// DSN-gated: no NEXT_PUBLIC_SENTRY_DSN → no-op.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV,
  // Session replay + tracing kept off by default (bandwidth on kid devices +
  // privacy: parent/kid data). Turn on later per-need.
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  debug: false,
});

// Required by Next.js App Router to capture navigation errors client-side.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
