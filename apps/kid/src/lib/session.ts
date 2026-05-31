import { useStore } from '../store';
import { enqueueEvent } from './events';
import { sync } from './sync';

// Tracks the screen the child is on, so a `session_end` can report `last_screen`
// (product §9.3 — feeds the parent's "where do sessions end" drop-off read, §13.4).
let lastScreen = 'hub';
export function setLastScreen(screen: string): void {
  lastScreen = screen;
}

// Guard so one sitting emits at most one `session_end`. The same sitting can
// trigger several lifecycle events (visibilitychange→hidden, pagehide); we
// dedupe per session_id. `session_end` is idempotent server-side via its
// event_id too, but this keeps the emitted log clean.
let endedSessionId: string | null = null;

// When the tab is backgrounded we record the time so a long absence can be
// detected on return. Short backgrounds (alt-tab, notification) keep the same
// sitting; absences beyond `BACKGROUND_NEW_SESSION_MS` close the current
// sitting and start a fresh one with a new session_id (product §9.3 — a kid
// returning hours later is a different sitting for analytics).
let backgroundedAt: number | null = null;
const BACKGROUND_NEW_SESSION_MS = 15 * 60 * 1000;

/**
 * Emit `session_end` for the current play sitting (duration + last screen).
 * Best-effort: called on pagehide and when a long background promotes the
 * sitting to a fresh one. Deduped per sitting so quick triggers don't spam.
 *
 * IMPORTANT: this is NOT called on every visibility-change-hidden. A backgrounded
 * tab is still "the same sitting" until enough time has passed (see
 * `noteBackground` / `noteForeground`). This way `session_end.duration_s`
 * reflects actual play time rather than first-background time.
 *
 * @param flush  push immediately (default). Pass false on pagehide where the
 *               manager's own lifecycle flush will pick it up.
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

/** Record that the tab went to the background. Does NOT emit `session_end`. */
export function noteBackground(): void {
  backgroundedAt = Date.now();
}

/**
 * Called when the tab comes back to the foreground. If the absence was longer
 * than `BACKGROUND_NEW_SESSION_MS`, end the current sitting and start a fresh
 * one with a new session_id; the returned object signals the caller (App.tsx)
 * to emit the new `session_start`.
 *
 * Returns `{ newSession: false }` for short absences (same sitting continues)
 * or `{ newSession: true, sessionId }` when a fresh sitting was minted.
 */
export async function noteForeground(): Promise<{ newSession: false } | { newSession: true; sessionId: string }> {
  const at = backgroundedAt;
  backgroundedAt = null;
  if (at === null) return { newSession: false };
  const away = Date.now() - at;
  if (away < BACKGROUND_NEW_SESSION_MS) return { newSession: false };

  // Long absence — close the current sitting cleanly, then mint a new one.
  const store = useStore.getState();
  const profile = store.profile;
  if (!profile || !store.play) return { newSession: false };

  await endSession(true);
  store.endPlay();
  armSessionEnd();
  const sessionId = store.startPlay();
  await enqueueEvent(
    { name: 'session_start', initiation_label: null },
    { profileId: profile.id, sessionId },
  );
  return { newSession: true, sessionId };
}
