// apps/kid/src/lib/flags.ts
// Offline-first feature-flag consumption (design 2026-07-16). Reads the
// persisted store; falls back to the code-declared default when never fetched.
// refreshFlags is best-effort — offline / unpaired failures are swallowed and
// the last-known values are kept.
import { FLAG_KEYS, FLAG_FALLBACKS, type FlagKey } from '@gabee/types';
import { useStore } from '../store';
import { api } from './api';

/** Live gate read: stored value if present, else the code fallback. */
export function isFeatureEnabled(key: FlagKey): boolean {
  return useStore.getState().featureFlags[key] ?? FLAG_FALLBACKS[key];
}

/**
 * Best-effort refresh. Filters the server response to keys this build knows
 * (forward-compat) and writes them to the store. Never throws.
 */
export async function refreshFlags(): Promise<void> {
  try {
    const res = await api.getEffectiveFlags();
    const known: Partial<Record<FlagKey, boolean>> = {};
    for (const key of FLAG_KEYS) {
      const v = res.flags[key];
      if (typeof v === 'boolean') known[key] = v;
    }
    useStore.getState().setFeatureFlags(known);
  } catch {
    /* offline / not paired — keep the last known values */
  }
}
