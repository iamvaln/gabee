import type { LevelProgress } from '@gabee/types';

/**
 * Code-module progression is kept in localStorage, segmented per world
 * (`code.maze` / `code.draw` / `code.actions`). The canonical synced track
 * (product §7.3) lumps the worlds together, but the kid app needs INDEPENDENT
 * level/lesson gating per world — so we keep a parallel local track.
 */
export type LocalCodeTrack = { levels: LevelProgress[] };

function lsKey(subKey: string, profileId: string | null): string {
  return `gabee.kid.${subKey}.${profileId ?? 'anon'}`;
}

export function readLocalTrack(subKey: string, profileId: string | null): LocalCodeTrack {
  if (typeof window === 'undefined') return { levels: [] };
  try {
    const raw = window.localStorage.getItem(lsKey(subKey, profileId));
    if (!raw) return { levels: [] };
    const parsed = JSON.parse(raw) as LocalCodeTrack;
    if (!parsed || !Array.isArray(parsed.levels)) return { levels: [] };
    return parsed;
  } catch {
    return { levels: [] };
  }
}

export function writeLocalTrack(subKey: string, profileId: string | null, track: LocalCodeTrack): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(lsKey(subKey, profileId), JSON.stringify(track));
  } catch {
    // Quota or disabled storage — ignore; progression resets on refresh but the
    // lesson still played.
  }
}
