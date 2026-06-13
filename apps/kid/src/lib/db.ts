import Dexie, { type EntityTable } from 'dexie';
import type { ChildProfile, EventEnvelope, ProgressSyncRequest, QuestionBundleResponse } from '@gabee/types';

/** A parent → kid message cached locally so the bandeau survives offline reloads. */
export interface LocalMessage {
  id: string;
  fromParentId: string;
  fromDisplayName: string;
  text: string;
  /** ISO datetime from the server. */
  createdAt: string;
  /** Device epoch (ms) when the kid app first surfaced the bandeau, if ever. */
  deliveredAt?: number;
  /** unread = in the queue; read = the kid tapped Continue (kept briefly for sync). */
  status: 'unread' | 'read';
}

// Local sync queues (product §8). Events and progress diffs are buffered here and
// drained by the sync manager (`lib/sync.ts`): batching, retry/backoff, offline
// correctness. Nothing is lost across reconnect.

/** A buffered analytics event, awaiting batch ingestion. */
export interface QueuedEvent {
  id: number;
  envelope: EventEnvelope;
}

/**
 * A pending progress snapshot for one profile. Progress sync is last-write-wins per
 * field (product §8) and the kid is the only writer, so we keep at most ONE row per
 * profile — the latest snapshot supersedes any earlier un-synced one (keyed by
 * `profile_id`, replaced via `put`). No diff history needed.
 */
export interface QueuedProgress {
  profile_id: string;
  body: ProgressSyncRequest;
}

/**
 * A locally cached question bundle (product §8 — cache-first content, network-first
 * updates). One row per module, keyed by `module`. The payload is the FULL
 * `QuestionBundleResponse` returned by `GET /api/bundles/:module`; the manifest
 * scalars (`version`, `published_at`) are de-normalized to the row for cheap
 * freshness comparisons against `GET /api/bundles` without rehydrating the JSON.
 *
 * `version` is nullable so the kid app still works against a manifest that hasn't
 * been upgraded yet (B1 work-in-progress) — in that case we fall back to
 * `published_at` for the freshness check.
 */
export interface CachedBundle {
  module: string;
  version: number | null;
  published_at: string;
  fetched_at: string;
  payload: QuestionBundleResponse;
}

export const db = new Dexie('gabee-kid') as Dexie & {
  events: EntityTable<QueuedEvent, 'id'>;
  progress: EntityTable<QueuedProgress, 'profile_id'>;
  messages: EntityTable<LocalMessage, 'id'>;
  bundles: EntityTable<CachedBundle, 'module'>;
  profiles: EntityTable<ChildProfile, 'id'>;
};

db.version(1).stores({
  events: '++id',
});

// v2 adds the progress replay queue (milestone 5: resilient progress sync).
db.version(2).stores({
  events: '++id',
  progress: 'profile_id',
});

// v3 adds the parent → kid message cache (changes-v1 §1 / parent spec §8.4).
// Additive only — pre-existing tables keep their schema string so Dexie won't drop
// any queued events or progress rows on upgrade.
db.version(3).stores({
  events: '++id',
  progress: 'profile_id',
  messages: 'id, status, createdAt',
});

// v4 adds the per-module bundle cache (product §8 — offline-capable kid app).
// Pre-existing tables keep their schema string so events/progress/messages
// survive the upgrade. Indexed by `module` (string primary key); we also index
// `published_at` so the Settings screen can list bundles in publication order
// without a full-table sort.
db.version(4).stores({
  events: '++id',
  progress: 'profile_id',
  messages: 'id, status, createdAt',
  bundles: 'module, published_at',
});

// v5 adds the child-profile cache (offline-capable kid app). Without it, a
// relaunch while offline strands the kid on ProfileSelect — `profile` isn't
// persisted (re-picked each launch) and `GET /api/profiles` can't be reached,
// so the picker shows an error and the kid can never reach the (cached) hub.
// We write-through on every successful fetch and read back when offline.
// Indexed by `id` (primary) + `parent_id` so a future account switch can scope.
db.version(5).stores({
  events: '++id',
  progress: 'profile_id',
  messages: 'id, status, createdAt',
  bundles: 'module, published_at',
  profiles: 'id, parent_id',
});
