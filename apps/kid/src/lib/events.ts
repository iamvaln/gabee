import { EVENT_SCHEMA_VERSION, type AnalyticsEvent, type EventEnvelope } from '@gabee/types';
import { db } from './db';
import { sync } from './sync';

interface EventContext {
  profileId?: string | null;
  sessionId?: string | null;
}

/** Build an envelope and buffer it locally (offline-safe). */
export async function enqueueEvent(event: AnalyticsEvent, ctx: EventContext = {}): Promise<void> {
  const envelope: EventEnvelope = {
    event_id: crypto.randomUUID(),
    profile_id: ctx.profileId ?? null,
    session_id: ctx.sessionId ?? null,
    client_ts: new Date().toISOString(),
    schema_version: EVENT_SCHEMA_VERSION,
    event,
  };
  await db.events.add({ envelope });
}

/**
 * Trigger a sync drain (events + queued progress). Thin wrapper over the sync manager,
 * which owns batching, retry/backoff, offline-awareness and the in-flight guard.
 * Kept for the existing call sites (app launch, session end, lesson complete).
 */
export async function flushEvents(): Promise<void> {
  await sync.flush();
}
