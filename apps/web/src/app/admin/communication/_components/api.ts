import * as Sentry from '@sentry/nextjs';

/**
 * Client side of the Communication admin API (Task 10 routes). Every call
 * sends `Content-Type: application/json` (the validate route ignores a body
 * without it) and turns any failure into an `ApiError` the screens map to
 * plain words with `errorText`.
 */

export const API = '/api/admin/communication';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    /** The answer is the studio API's own JSON error: the request was handled to the end. */
    public fromServer = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never got an answer (offline, DNS, timeout): its outcome is unknown. */
const networkError = () => new ApiError(0, 'network', 'Network request failed');

/** Codes that prove the AI call is over (it failed), so no paid run is still going. */
const AI_ENDED = new Set(['ai_unavailable', 'ai_refused', 'ai_invalid_output']);

/**
 * True when `err` proves a long AI operation has ended on the server: the
 * API answered with its own JSON error for an AI failure, or a JSON 5xx
 * (the route's error path ran). A network failure, a timeout or a proxy
 * page proves nothing: the server may still be working.
 */
export function provesRunEnded(err: unknown): boolean {
  if (!(err instanceof ApiError) || !err.fromServer) return false;
  return AI_ENDED.has(err.code) || err.status >= 500;
}

export async function api<T>(path: string, init: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT'; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch {
    throw networkError();
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // A proxy error page or a crashed route: not our JSON shape.
      throw new ApiError(res.status, res.ok ? 'bad_response' : 'internal_error', text.slice(0, 200));
    }
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'internal_error', e?.message ?? `HTTP ${res.status}`, e?.details, e !== undefined);
  }
  return data as T;
}

/**
 * Report an unexpected client failure. HTTP errors are already reported by
 * the server (5xx) or are expected outcomes (4xx); a network failure is the
 * viewer's connection. Anything else is a bug in this screen.
 */
export function reportUnexpected(err: unknown, context: Record<string, unknown>): void {
  if (err instanceof ApiError && err.code !== 'bad_response') return;
  Sentry.captureException(err, { tags: { scope: 'admin.communication' }, extra: context });
}

export { notifyStudioChanged } from '../../_shell/studio-events';

/**
 * "Télécharger": the route answers with a redirect to a short-lived
 * presigned URL served as an attachment. Probe it without following the
 * redirect so an error (storage down, file not ready) shows in the page
 * instead of replacing it, then navigate to it: the attachment downloads
 * and the page stays put. Throws `ApiError` on failure.
 */
async function download(url: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'manual', cache: 'no-store' });
  } catch {
    throw networkError();
  }
  if (res.type !== 'opaqueredirect' && !res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, data?.error?.code ?? 'internal_error', data?.error?.message ?? `HTTP ${res.status}`);
  }
  window.location.assign(url);
}

/** A draft's media, under its readable name (`YYYY-MM-DD-<platform>-<slug>.<ext>`). */
export const downloadDraftMedia = (draftId: string) => download(`${API}/drafts/${draftId}/media`);

/** A library file, under its own file name. */
export const downloadMedia = (assetId: string) => download(mediaFileUrl(assetId));

/** The library file's route (a redirect to a short-lived presigned URL; images render through it). */
export const mediaFileUrl = (assetId: string) => `${API}/media/${assetId}/download`;
