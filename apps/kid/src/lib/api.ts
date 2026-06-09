import {
  AuthSessionResponseSchema,
  BundleManifestResponseSchema,
  ClaimDevicePairResponseSchema,
  type ClaimPairCodeRequest,
  ListProfilesResponseSchema,
  QuestionBundleResponseSchema,
  IngestEventsResponseSchema,
  ProgressSyncResponseSchema,
  KidPendingMessagesResponseSchema,
  KidEffectiveLimitsSchema,
  KidStreakStateSchema,
  type AuthSessionResponse,
  type BundleManifestEntry,
  type ClaimDevicePairRequest,
  type ClaimDevicePairResponse,
  type ListProfilesResponse,
  type QuestionBundleResponse,
  type IngestEventsResponse,
  type ProgressSyncRequest,
  type ProgressSyncResponse,
  type KidPendingMessagesResponse,
  type KidEffectiveLimits,
  type KidStreakState,
  type EventEnvelope,
  type Module,
} from '@gabee/types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

// Late-bound reference to `./bundles` to break the cycle WITHOUT a dynamic
// import. bundles.ts is loaded on the launch path anyway (pair.ts +
// main.tsx) — referencing it via a getter delays the lookup to first call
// time, after both modules have finished initialising.
let _bundlesCache: typeof import('./bundles') | null = null;
function bundlesModule(): typeof import('./bundles') {
  if (_bundlesCache) return _bundlesCache;
  // Set during late-binding — see `bindBundlesModule` exported below, called
  // by main.tsx after bundles.ts has fully loaded.
  if (!_bundlesCache) {
    throw new Error('[api] bundles module not bound yet — call bindBundlesModule first');
  }
  return _bundlesCache;
}
export function bindBundlesModule(mod: typeof import('./bundles')): void {
  _bundlesCache = mod;
}

// The kid device pairs once (parent login) and then calls the cross-origin API with
// the parent's JWT as a bearer token (product §7.2, §11.3).
let bearerToken: string | null = null;
export function setApiToken(token: string | null): void {
  bearerToken = token;
}

// Registered by the store on init: when any API call returns 401 (token absent,
// signature invalid, or — after a dev DB reset — referencing a parent that no longer
// exists), we clear the persisted auth so App.tsx falls back to the Login screen.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(cb: (() => void) | null): void {
  onUnauthorized = cb;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (bearerToken) headers.set('Authorization', `Bearer ${bearerToken}`);
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    // Don't trigger on the login call itself — there a 401 means "bad credentials",
    // not "session expired". Anywhere else, 401 means the bearer is dead.
    if (res.status === 401 && path !== '/api/auth/login') onUnauthorized?.();
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed (${res.status})`);
  }
  return body;
}

export const api = {
  async login(email: string, password: string): Promise<AuthSessionResponse> {
    return AuthSessionResponseSchema.parse(
      await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    );
  },
  // Device pairing (parent spec §10.4 / §12.3 P9). The kid PWA reads `?pair=`
  // on first launch and exchanges it for a long-lived device-bound bearer.
  // NO Authorization header is sent — the JWT in the body IS the auth.
  async claimPairToken(
    token: string,
    extra?: Pick<ClaimDevicePairRequest, 'user_agent_hint'>,
  ): Promise<ClaimDevicePairResponse> {
    const body: ClaimDevicePairRequest = { token, ...extra };
    return ClaimDevicePairResponseSchema.parse(
      await request('/api/pair/claim', { method: 'POST', body: JSON.stringify(body) }),
    );
  },
  /**
   * Short-code pair claim. Called AFTER the parent has signed in on the kid
   * device with email/password — the bearer that goes in the Authorization
   * header is the actual auth gate (the code alone is useless without it).
   * On success, returns a fresh ~180d device-bound bearer that should
   * replace the parent session JWT in the store.
   */
  async claimPairCode(
    code: string,
    extra?: Pick<ClaimPairCodeRequest, 'user_agent_hint'>,
  ): Promise<ClaimDevicePairResponse> {
    const body: ClaimPairCodeRequest = { code, ...extra };
    return ClaimDevicePairResponseSchema.parse(
      await request('/api/pair/claim-code', { method: 'POST', body: JSON.stringify(body) }),
    );
  },
  async getProfiles(): Promise<ListProfilesResponse> {
    return ListProfilesResponseSchema.parse(await request('/api/profiles'));
  },
  /**
   * Bundles manifest (product §8). Cheap call that lists each module's current
   * version + published_at + question_count — drives "should I refresh?". Wired
   * by `lib/bundles.refreshIfNewer`.
   */
  async getManifest(): Promise<BundleManifestEntry[]> {
    const res = BundleManifestResponseSchema.parse(await request('/api/bundles'));
    return res.bundles;
  },
  /**
   * Cache-first bundle fetch (product §8). Reads through the Dexie cache so
   * TanStack Query layers above are transparently offline-capable:
   *   1. If a cached bundle exists, return it immediately (no network).
   *   2. Otherwise, fetch from the server, persist it, and return.
   * Background freshness is the launch-time `refreshIfNewer` sweep in
   * `lib/bundles.ts` — this path stays fast.
   */
  async getBundle(module: Module): Promise<QuestionBundleResponse> {
    // Lazy require via a runtime function call — bundles.ts is also a static
    // import on the launch path (pair.ts, main.tsx, Settings.tsx) so a `await
    // import()` here only hurts chunk splitting (Vite warns and inlines it
    // anyway). The actual circular concern is bundles.ts importing the `api`
    // object eagerly — but only its functions reach for `api`, so the cycle
    // is resolved at first call, not at module init.
    const { getCachedBundle, fetchAndCacheBundle } = bundlesModule();
    const cached = await getCachedBundle(module);
    if (cached) return cached;
    return fetchAndCacheBundle(module);
  },
  /** Network-only bundle fetch — used by `lib/bundles.ts` to (re)populate Dexie. */
  async fetchBundleFromNetwork(module: Module): Promise<QuestionBundleResponse> {
    return QuestionBundleResponseSchema.parse(await request(`/api/bundles/${module}`));
  },
  async ingestEvents(events: EventEnvelope[]): Promise<IngestEventsResponse> {
    return IngestEventsResponseSchema.parse(
      await request('/api/events', { method: 'POST', body: JSON.stringify({ events }) }),
    );
  },
  async syncProgress(body: ProgressSyncRequest): Promise<ProgressSyncResponse> {
    return ProgressSyncResponseSchema.parse(
      await request('/api/progress/sync', { method: 'POST', body: JSON.stringify(body) }),
    );
  },
  // Parent → kid messages (changes-v1 §1 / parent spec §8). The kid app polls the
  // pending queue at session_start + hub mount and surfaces unread messages as the
  // mint bandeau between lessons. `markMessageRead` reports the Continue tap.
  async getPendingMessages(childId: string): Promise<KidPendingMessagesResponse> {
    return KidPendingMessagesResponseSchema.parse(
      await request(`/api/messages/pending?child_id=${encodeURIComponent(childId)}`),
    );
  },
  async markMessageRead(messageId: string): Promise<void> {
    await request(`/api/messages/${encodeURIComponent(messageId)}/read`, { method: 'POST' });
  },
  /**
   * Healthy-use limits resolved for ONE kid (admin defaults + parent overrides,
   * clamped). The kid app reads this on profile select and caches it for the
   * session to drive soft/hard caps and look-away breaks.
   */
  async getEffectiveLimits(profileId: string): Promise<KidEffectiveLimits> {
    return KidEffectiveLimitsSchema.parse(
      await request(`/api/profiles/${encodeURIComponent(profileId)}/effective-limits`),
    );
  },
  /**
   * Server-authoritative streak bump on lesson_completed (product §6.3). Called
   * after the lesson event has flushed so the server's "today" stamp can't be
   * gamed by device clock manipulation.
   */
  async postLessonCompleted(profileId: string): Promise<KidStreakState> {
    return KidStreakStateSchema.parse(
      await request(`/api/profiles/${encodeURIComponent(profileId)}/lesson-completed`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
  },
};
