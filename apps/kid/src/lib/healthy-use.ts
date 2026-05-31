import { create } from 'zustand';
import type { KidEffectiveLimits } from '@gabee/types';
import { api } from './api';

/**
 * Healthy-use timers (product §6.3, decided 2026-05-30/31). The kid app keeps
 * effective-limits in memory (fetched on profile select), tracks elapsed
 * session time and lessons-this-session, and emits overlay signals:
 *  - soft-limit reached: a friendly invite to take a break (kid can continue)
 *  - hard cap reached: ends the session, the kid app returns to the lock screen
 *  - daily cumul cap reached: locks the Hub until tomorrow (persisted)
 *  - look-away interval: every N min, an 20-second pause overlay
 *
 * Daily cumul + the last-played date are persisted to localStorage so a refresh
 * or a process kill doesn't reset the day's accounting.
 */

interface DailyStateRow {
  date: string; // YYYY-MM-DD (UTC)
  cumul_min: number;
  lessons_today: number;
}

interface HealthyUseState {
  limits: KidEffectiveLimits | null;
  profileId: string | null;
  // Live session timers (reset on session_start).
  sessionStartedAt: number | null;
  lastLookAwayAt: number | null;
  // Computed signals.
  softReached: boolean;
  hardCapReached: boolean;
  lookAwayDue: boolean;
  dailyLocked: boolean;
  // Persisted daily accounting.
  daily: DailyStateRow;
  // Setters.
  loadLimitsFor: (profileId: string) => Promise<void>;
  startSession: () => void;
  endSession: () => void;
  noteLessonCompleted: () => void;
  tick: () => void;
  acknowledgeSoft: () => void;
  acknowledgeLookAway: () => void;
}

const TICK_MS = 5_000;

function todayKey(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function dailyLsKey(profileId: string): string {
  return `gabee.kid.healthy-use.daily.${profileId}`;
}

function readDaily(profileId: string): DailyStateRow {
  const empty: DailyStateRow = { date: todayKey(), cumul_min: 0, lessons_today: 0 };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(dailyLsKey(profileId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as DailyStateRow;
    if (parsed.date !== todayKey()) return empty; // stale day, reset
    return parsed;
  } catch {
    return empty;
  }
}

function writeDaily(profileId: string, row: DailyStateRow): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(dailyLsKey(profileId), JSON.stringify(row));
  } catch {
    // Quota/disabled — best-effort.
  }
}

let tickTimer: ReturnType<typeof setInterval> | null = null;

export const useHealthyUse = create<HealthyUseState>((set, get) => ({
  limits: null,
  profileId: null,
  sessionStartedAt: null,
  lastLookAwayAt: null,
  softReached: false,
  hardCapReached: false,
  lookAwayDue: false,
  dailyLocked: false,
  daily: { date: todayKey(), cumul_min: 0, lessons_today: 0 },

  async loadLimitsFor(profileId: string) {
    const daily = readDaily(profileId);
    try {
      const limits = await api.getEffectiveLimits(profileId);
      set({
        limits,
        profileId,
        daily,
        dailyLocked: daily.cumul_min >= limits.daily_total_cap_min,
      });
    } catch {
      // Network failure — keep what we have; the kid app still works against
      // cached bundles. Daily cumul still counts so the kid doesn't bypass
      // the cap by going offline.
      set({ profileId, daily });
    }
  },

  startSession() {
    if (tickTimer !== null) clearInterval(tickTimer);
    set({
      sessionStartedAt: Date.now(),
      lastLookAwayAt: Date.now(),
      softReached: false,
      hardCapReached: false,
      lookAwayDue: false,
    });
    tickTimer = setInterval(() => get().tick(), TICK_MS);
  },

  endSession() {
    if (tickTimer !== null) clearInterval(tickTimer);
    tickTimer = null;
    set({ sessionStartedAt: null, lastLookAwayAt: null });
  },

  noteLessonCompleted() {
    const { profileId, daily } = get();
    if (!profileId) return;
    const next: DailyStateRow = {
      date: todayKey(),
      cumul_min: daily.cumul_min,
      lessons_today: daily.lessons_today + 1,
    };
    writeDaily(profileId, next);
    set({ daily: next });
  },

  tick() {
    const s = get();
    if (!s.sessionStartedAt || !s.limits) return;
    const elapsedMs = Date.now() - s.sessionStartedAt;
    const elapsedMin = elapsedMs / 60_000;
    // Soft limit: fires once.
    const soft = elapsedMin >= s.limits.session_soft_limit_min && !s.softReached;
    // Hard cap: fires once.
    const hard = elapsedMin >= s.limits.session_hard_cap_min;
    // Look-away every N min during a session (off when disabled).
    let lookAway = false;
    if (s.limits.look_away_enabled && s.lastLookAwayAt) {
      const sinceLook = (Date.now() - s.lastLookAwayAt) / 60_000;
      if (sinceLook >= s.limits.look_away_interval_min) lookAway = true;
    }
    // Update daily cumul every tick (TICK_MS / 60_000 minutes per tick).
    if (s.profileId) {
      const incMin = TICK_MS / 60_000;
      const next: DailyStateRow = {
        date: todayKey(),
        cumul_min: s.daily.cumul_min + incMin,
        lessons_today: s.daily.lessons_today,
      };
      writeDaily(s.profileId, next);
      const dailyLocked = next.cumul_min >= s.limits.daily_total_cap_min;
      set({ daily: next, dailyLocked });
    }
    set({
      softReached: s.softReached || soft,
      hardCapReached: s.hardCapReached || hard,
      lookAwayDue: s.lookAwayDue || lookAway,
    });
  },

  acknowledgeSoft() {
    set({ softReached: false });
  },

  acknowledgeLookAway() {
    set({ lookAwayDue: false, lastLookAwayAt: Date.now() });
  },
}));
