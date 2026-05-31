import { create } from 'zustand';

/**
 * Idle tracker (product §6.3 — kids share devices at home; a sibling who walks
 * in shouldn't accidentally clock minutes on the wrong profile). After
 * `IDLE_LOCK_MS` of no user interaction, `isLocked` flips to true and the
 * LockScreen renders.
 *
 * Activity is any mousedown / touchstart / keydown / scroll. The timer is
 * armed when a profile is picked, and re-armed on every interaction. While
 * locked, interaction does NOT auto-unlock — the kid must tap their avatar
 * (or the "Not me" link to switch profile), so we don't quietly resume the
 * wrong kid's session if a sibling brushes the screen.
 */

// 3 min of inactivity before locking. Kids have short attention spans;
// shorter timeouts trade UX (the lock appearing during a long "thinking")
// for safety (sibling switch). 3 min is the rough median attention-span span.
const IDLE_LOCK_MS = 3 * 60 * 1000;

interface IdleState {
  isLocked: boolean;
  lastActivityAt: number | null;
  bump: () => void;
  arm: () => void;
  disarm: () => void;
  forceLock: () => void;
  unlock: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

export const useIdle = create<IdleState>((set, get) => ({
  isLocked: false,
  lastActivityAt: null,

  bump() {
    if (get().isLocked) return; // do NOT reset countdown while locked
    set({ lastActivityAt: Date.now() });
    clearTimer();
    timer = setTimeout(() => {
      set({ isLocked: true });
    }, IDLE_LOCK_MS);
  },

  arm() {
    set({ isLocked: false, lastActivityAt: Date.now() });
    clearTimer();
    timer = setTimeout(() => {
      set({ isLocked: true });
    }, IDLE_LOCK_MS);
  },

  disarm() {
    set({ isLocked: false, lastActivityAt: null });
    clearTimer();
  },

  forceLock() {
    clearTimer();
    set({ isLocked: true });
  },

  unlock() {
    set({ isLocked: false, lastActivityAt: Date.now() });
    clearTimer();
    timer = setTimeout(() => {
      set({ isLocked: true });
    }, IDLE_LOCK_MS);
  },
}));

/**
 * Register browser-level activity listeners. Returns a cleanup fn. Idempotent
 * via a module-level flag — re-registering wouldn't break correctness but
 * would double-fire `bump()` on each event.
 */
let listenersInstalled = false;

export function installIdleListeners(): () => void {
  if (listenersInstalled || typeof window === 'undefined') return () => {};
  listenersInstalled = true;
  const handler = () => useIdle.getState().bump();
  const events = ['mousedown', 'touchstart', 'keydown', 'scroll'] as const;
  for (const e of events) window.addEventListener(e, handler, { passive: true });
  return () => {
    for (const e of events) window.removeEventListener(e, handler);
    listenersInstalled = false;
  };
}
