import * as Sentry from '@sentry/nextjs';

// Next.js instrumentation hook. `register()` runs once per runtime at boot and
// loads the right Sentry config for the active runtime (Node vs Edge).
// `onRequestError` forwards uncaught Server Component / route-handler errors to
// Sentry. All of this is inert when no DSN is set (the config files no-op).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
