import type { ClaimDevicePairResponse } from '@gabee/types';
import { useStore } from '../store';
import { api } from './api';
import { downloadAllBundles, requestPersistedStorage } from './bundles';

// Device-pairing entry for the kid PWA (parent spec §10.4 / §12.3 P9).
//
// On first mount we look for `?pair=<jwt>` in window.location. If present we
// POST it to /api/pair/claim cross-origin (NO bearer — the JWT IN the body IS
// the auth) and, on success, drop the long-lived parent JWT into the kid
// store so the next render skips Login and lands on ProfileSelect. We strip
// `?pair=` from the URL whether the claim succeeds or fails so a refresh
// doesn't replay (the server would reject a used token anyway with 409, but
// we don't want the kid to see a flash of an error every reload).

/** True iff the current URL carries a `?pair=` query param. Cheap; sync. */
export function hasPairTokenInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('pair');
}

/**
 * Read the pair token from the URL, exchange it for a device-bound bearer,
 * and persist it in the store. Returns the claim result on success, or null
 * if there was no token / the exchange failed. Always strips `?pair=` from
 * the URL after the attempt.
 */
export async function consumePairToken(): Promise<ClaimDevicePairResponse | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('pair');
  if (!token) return null;

  // Strip the param up front so a refresh during the request doesn't double-call.
  params.delete('pair');
  const newSearch = params.toString();
  const newUrl =
    window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
  window.history.replaceState(null, '', newUrl);

  try {
    const result = await api.claimPairToken(token, {
      user_agent_hint: navigator.userAgent.slice(0, 160),
    });
    useStore.getState().setAuth(result.token, {
      id: result.parent.id,
      email: result.parent.email,
    });
    // Pre-warm the offline cache: ask for persisted storage + pull every module
    // bundle so the kid can play immediately, even if the network drops mid-
    // session (product §8). Fire-and-forget — login flow doesn't block on it.
    void requestPersistedStorage();
    void downloadAllBundles();
    return result;
  } catch (err) {
    // The Login screen will take over; the kid (or parent) can re-send the
    // link from the parent app. Keep the failure silent in the UI for Phase 1
    // — the most likely cause is an expired/used token, which is benign.
    // eslint-disable-next-line no-console
    console.warn('[gabee:pair] claim failed', err);
    return null;
  }
}
