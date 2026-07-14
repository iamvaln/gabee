/**
 * Shared loading/error decision for the 9 kid session screens. The bundle query
 * (`useQuery(['bundle', module])`) can (a) error — offline before it's cached,
 * unpaired → 401, network fail — or (b) settle "paused" with no data while
 * offline (networkMode: 'offlineFirst'). Both mean the kid should see the
 * friendly error state, not an endless loader.
 */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function bundleLoadFailed(p: {
  isLoading: boolean;
  isError: boolean;
  hasBundle: boolean;
  offline: boolean;
}): boolean {
  if (p.isError) return true;
  // Settled (not loading) with no bundle AND offline → stuck; show the error.
  return !p.isLoading && !p.hasBundle && p.offline;
}
