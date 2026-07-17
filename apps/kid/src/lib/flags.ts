// apps/kid/src/lib/flags.ts
// Offline-first feature-flag consumption (design 2026-07-16). Reads the
// persisted store; falls back to the code-declared default when never fetched.
// refreshFlags is best-effort — offline / unpaired failures are swallowed and
// the last-known values are kept.
import { FLAG_KEYS, FLAG_FALLBACKS, moduleFlag, levelFlag, worldLevelFlag, type FlagKey, type Module } from '@gabee/types';
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

// ── Content rollout visibility ───────────────────────────────────────────────
// A module/level with no registered flag is always visible; otherwise it follows
// the flag. The `*With` variants take an injectable lookup for unit testing.

export function isModuleVisibleWith(m: Module, lookup: (k: FlagKey) => boolean): boolean {
  const f = moduleFlag(m);
  return f === undefined || lookup(f);
}
export function isLevelVisibleWith(m: Module, level: number, lookup: (k: FlagKey) => boolean): boolean {
  const f = levelFlag(m, level);
  return f === undefined || lookup(f);
}
/** A level in a specific world is visible only if BOTH its module-level gate
 *  (world-blind, e.g. code_l6) and its world-level gate (e.g. code_draw_l4) pass. */
export function isWorldLevelVisibleWith(
  m: Module,
  world: string,
  level: number,
  lookup: (k: FlagKey) => boolean,
): boolean {
  if (!isLevelVisibleWith(m, level, lookup)) return false;
  const f = worldLevelFlag(m, world, level);
  return f === undefined || lookup(f);
}
/** Production gates over the live flag store. */
export const isModuleVisible = (m: Module): boolean => isModuleVisibleWith(m, isFeatureEnabled);
export const isLevelVisible = (m: Module, level: number): boolean => isLevelVisibleWith(m, level, isFeatureEnabled);
/** Filter a derived level list to the visible ones (identity for unflagged modules). */
export const visibleLevels = (
  m: Module,
  levels: number[],
  lookup: (k: FlagKey) => boolean = isFeatureEnabled,
): number[] => levels.filter((lvl) => isLevelVisibleWith(m, lvl, lookup));
/** World-scoped variant — applies both the module-level and world-level gates. */
export const visibleWorldLevels = (
  m: Module,
  world: string,
  levels: number[],
  lookup: (k: FlagKey) => boolean = isFeatureEnabled,
): number[] => levels.filter((lvl) => isWorldLevelVisibleWith(m, world, lvl, lookup));
