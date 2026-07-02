import * as Sentry from '@sentry/react';

// Kid-app Sentry init. DSN-gated on VITE_SENTRY_DSN (inlined at build time by
// Vite). With no DSN this is a no-op — nothing initialises, zero bundle-time
// network, so local dev + any build without the var behave exactly as before.
//
// Kept deliberately lean for a kid PWA on possibly-slow devices: no session
// replay, no performance tracing (bandwidth + child-data privacy). Errors
// captured offline are queued by the SDK and flushed when connectivity returns,
// which matches the app's offline-first model.
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Version tag mirrors the Settings → About build stamp so an error can be
    // traced to a specific deployed kid build.
    release: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev',
  });
}

export { Sentry };
