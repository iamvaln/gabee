import type { KidStreakState } from '@gabee/types';
import { api } from './api';

/**
 * Local-cached streak state (product §6.3). The server is authoritative on
 * "today" — we POST `/api/profiles/[id]/lesson-completed` after every lesson
 * completes, take the returned state as truth, and cache it for fast UI reads.
 * Reads survive offline; if the next bump fails, the cached value stays — and
 * the next successful bump reconciles.
 */

function lsKey(profileId: string): string {
  return `gabee.kid.streak.${profileId}`;
}

export function readStreak(profileId: string | null): KidStreakState {
  const empty: KidStreakState = { streak_days: 0, longest_streak_days: 0, last_lesson_date: null };
  if (!profileId || typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(lsKey(profileId));
    if (!raw) return empty;
    return JSON.parse(raw) as KidStreakState;
  } catch {
    return empty;
  }
}

function writeStreak(profileId: string, state: KidStreakState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(lsKey(profileId), JSON.stringify(state));
  } catch {
    // best-effort
  }
}

/**
 * Server-authoritative streak bump. Returns the new state; null when the
 * network is down (the cached value remains valid until the next successful
 * call). Idempotent on the server side for same-day calls.
 */
export async function bumpStreak(profileId: string): Promise<KidStreakState | null> {
  try {
    const state = await api.postLessonCompleted(profileId);
    writeStreak(profileId, state);
    return state;
  } catch {
    return null;
  }
}
