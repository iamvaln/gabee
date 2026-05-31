import { useStore } from '../store';
import { enqueueEvent } from './events';
import { sync } from './sync';

// Tracks the screen the child is on, so a `session_end` can report `last_screen`
// (product §9.3 — feeds the parent's "where do sessions end" drop-off read, §13.4).
let lastScreen = 'hub';
export function setLastScreen(screen: string): void {
  lastScreen = screen;
}

// Guard so one sitting emits at most one `session_end`. The same sitting can trigger
// several lifecycle events (a tab switch fires visibilitychange→hidden; closing fires
// pagehide), and we don't want a brief tab switch to look like multiple sittings ending.
// `session_end` is idempotent server-side via its event_id too, but this keeps the
// emitted log clean (one end per sitting, product §9.3 / drop-off read §13.4).
let endedSessionId: string | null = null;

/**
 * Emit `session_end` for the current play sitting (duration + last screen). Best-effort:
 * called from lifecycle handlers (visibilitychange→hidden, pagehide). Deduped per sitting
 * so a quick tab switch doesn't spam ends; the play session is left intact so that if the
 * child comes right back, their events still carry the session_id. A truly new sitting is
 * begun by re-picking a profile (`armSessionEnd` then `startPlay`).
 *
 * @param flush  push immediately (default). Pass false on pagehide where the manager's
 *               own lifecycle flush will pick it up, to avoid racing teardown.
 */
export async function endSession(flush = true): Promise<void> {
  const { play, profile } = useStore.getState();
  if (!play || endedSessionId === play.id) return;
  endedSessionId = play.id;

  const duration_s = Math.max(0, Math.round((Date.now() - play.startedAt) / 1000));
  await enqueueEvent(
    { name: 'session_end', duration_s, last_screen: lastScreen },
    { profileId: profile?.id ?? null, sessionId: play.id },
  );
  if (flush) await sync.flush();
}

/** Reset the dedupe guard when a brand-new sitting starts (on profile pick). */
export function armSessionEnd(): void {
  endedSessionId = null;
}
