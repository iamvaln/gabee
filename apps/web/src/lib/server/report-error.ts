import * as Sentry from '@sentry/nextjs';

/**
 * The one way server code reports an error it has caught and decided not to
 * rethrow (Content Studio rule: no swallowed errors). It writes a scoped line
 * to the server log and sends the error to Sentry, tagged by `scope` so the
 * Ops pages and Sentry can filter by job / agent / route.
 *
 * The caller still records the failure on its own row (job run, agent run,
 * notification…) — this helper only covers the "and tell Sentry" half.
 */
export type ErrorContext = { scope: string; [key: string]: unknown };

type CaptureHint = { tags: { scope: string }; extra: Record<string, unknown> };
type Capture = (err: unknown, hint: CaptureHint) => void;

const sentryCapture: Capture = (err, hint) => {
  Sentry.captureException(err, hint);
};

let capture: Capture = sentryCapture;

/** Test seam: replace the Sentry capture (null restores the real one). */
export function setErrorReporterForTests(fn: Capture | null): void {
  capture = fn ?? sentryCapture;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function reportError(err: unknown, context: ErrorContext): void {
  const { scope } = context;
  console.error(`[${scope}] ${describe(err)}`, context);
  try {
    capture(err, { tags: { scope }, extra: { ...context } });
  } catch (reporterErr) {
    // Reporting must never mask the original failure: the caller is already in
    // its error path. Log the reporter failure so it is still visible.
    console.error(`[report-error] Sentry capture failed: ${describe(reporterErr)}`);
  }
}
