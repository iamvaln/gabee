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
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never got an answer (offline, DNS, server down). */
const networkError = () => new ApiError(0, 'network', 'Network request failed');

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
    throw new ApiError(res.status, e?.code ?? 'internal_error', e?.message ?? `HTTP ${res.status}`, e?.details);
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

/** Studio data changed: the nav badge re-reads the pending counts. */
export const STUDIO_CHANGED = 'gabee:studio-changed';

export function notifyStudioChanged(): void {
  window.dispatchEvent(new Event(STUDIO_CHANGED));
}

/**
 * "Télécharger le média": the route answers with a redirect to a short-lived
 * presigned URL served as an attachment. Probe it without following the
 * redirect so an error (storage down, file not ready) shows in the page
 * instead of replacing it, then navigate to it: the attachment downloads
 * and the page stays put. Throws `ApiError` on failure.
 */
export async function downloadDraftMedia(draftId: string): Promise<void> {
  const url = `${API}/drafts/${draftId}/media`;
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
