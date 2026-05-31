/**
 * Bundle manager (product §8). The kid app boots from a cache-first store:
 *  - Pair time: `downloadAllBundles()` pulls every module to Dexie so the kid can
 *    immediately play offline.
 *  - Launch time: `refreshIfNewer()` compares the server manifest with the cached
 *    versions and swaps any stale entry — background, non-blocking.
 *  - Then `startBackgroundRefresh()` polls every 30 min while the tab is alive.
 *  - On the read path: `getCachedBundle()` returns the cached payload immediately;
 *    `fetchAndCacheBundle()` does a network round-trip + write-back as fallback.
 *
 * Persisted storage: at pair time we ask `navigator.storage.persist()` so the
 * cached bundles aren't evicted under cache pressure (e.g. on iOS Safari which
 * is aggressive about clearing IDB for non-persisted origins).
 */
import type { Module, QuestionBundleResponse } from '@gabee/types';
import { db } from './db';
import { api } from './api';

const ALL_MODULES: Module[] = ['numbers', 'words', 'translation', 'keyboard', 'code'];
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let backgroundTimer: ReturnType<typeof setInterval> | null = null;

/** Read the cached bundle from Dexie, or null if absent. */
export async function getCachedBundle(module: Module): Promise<QuestionBundleResponse | null> {
  try {
    const row = await db.bundles.get(module);
    return row ? row.payload : null;
  } catch {
    return null;
  }
}

/** Network fetch + write-back. Always returns a fresh payload (or throws). */
export async function fetchAndCacheBundle(module: Module): Promise<QuestionBundleResponse> {
  const payload = await api.fetchBundleFromNetwork(module);
  await db.bundles.put({
    module,
    version: payload.version,
    published_at: payload.published_at,
    fetched_at: new Date().toISOString(),
    payload,
  });
  return payload;
}

/**
 * Pair-time bundle hydration — download every module so the kid can play
 * offline from first launch. Errors are isolated per module: if one fetch fails
 * we keep going so the kid still gets the rest. Returns the list of modules
 * successfully downloaded.
 */
export async function downloadAllBundles(): Promise<Module[]> {
  const done: Module[] = [];
  await Promise.all(
    ALL_MODULES.map(async (module) => {
      try {
        await fetchAndCacheBundle(module);
        done.push(module);
      } catch {
        // Swallow — refreshIfNewer will retry on next launch.
      }
    }),
  );
  return done;
}

/**
 * Launch-time freshness sweep — compare server manifest to cached versions and
 * swap any stale entry in the background. Non-blocking: never throws to the
 * caller; failures just leave the cache as-is for next launch.
 */
export async function refreshIfNewer(): Promise<void> {
  try {
    const manifest = await api.getManifest();
    await Promise.all(
      manifest.map(async (entry) => {
        const cached = await db.bundles.get(entry.module);
        if (cached && cached.version != null && cached.version >= entry.version) return;
        // Also accept a missing version when published_at is fresher (back-compat
        // with v1 manifest entries that don't carry a version field).
        if (cached && cached.version == null && cached.published_at >= entry.published_at) return;
        try {
          await fetchAndCacheBundle(entry.module);
        } catch {
          // Stale entry survives; next sweep will retry.
        }
      }),
    );
  } catch {
    // Offline or server error — keep cached bundles; they're still usable.
  }
}

/**
 * Periodic background freshness check. Idempotent (safe to call twice — the
 * second call replaces the first interval).
 */
export function startBackgroundRefresh(): void {
  if (backgroundTimer !== null) clearInterval(backgroundTimer);
  backgroundTimer = setInterval(() => {
    void refreshIfNewer();
  }, REFRESH_INTERVAL_MS);
}

export function stopBackgroundRefresh(): void {
  if (backgroundTimer !== null) {
    clearInterval(backgroundTimer);
    backgroundTimer = null;
  }
}

/**
 * Ask the browser to mark this origin's storage as persistent so the cached
 * bundles aren't evicted under cache pressure. Best-effort: returns false if
 * the API is unavailable or the browser declines. Idempotent.
 */
export async function requestPersistedStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    const already = await navigator.storage.persisted();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Return the cached version for each module (for the Settings/debug screen). */
export async function listCachedBundles(): Promise<
  { module: Module; version: number | null; published_at: string; fetched_at: string; question_count: number }[]
> {
  try {
    const rows = await db.bundles.toArray();
    return rows.map((r) => ({
      module: r.module as Module,
      version: r.version,
      published_at: r.published_at,
      fetched_at: r.fetched_at,
      question_count: r.payload.questions.length,
    }));
  } catch {
    return [];
  }
}
