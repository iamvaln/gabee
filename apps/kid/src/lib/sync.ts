import type { ProgressSyncRequest } from '@gabee/types';
import { db } from './db';
import { api, ApiError } from './api';

/**
 * Sync manager (milestone 5 / product §8). Owns the offline queues and drains them to
 * the API with batching, retry+backoff, and offline-awareness. The rest of the app only
 * *enqueues* (events via `lib/events`, progress via `queueProgress`) and asks the manager
 * to `flush()`; it never talks to the network directly for sync.
 *
 * Guarantees:
 *  - No event loss across reconnect — rows stay queued until the server confirms it
 *    processed them (accepted + duplicates). Idempotency via the envelope `event_id`
 *    means a replay after a flaky response double-counts nothing server-side.
 *  - Rejected events (permanently invalid) are dropped after logging, so one bad row
 *    can't wedge the queue forever.
 *  - One flush at a time (in-flight guard), so triggers can't overlap and re-send rows.
 */

// Max envelopes per ingestion call — the API contract caps a request at 500
// (IngestEventsRequestSchema in @gabee/types). Never send more than this per call.
const MAX_BATCH = 500;

// Exponential backoff for transient failures (network / 5xx). Capped so we keep trying
// at a calm cadence rather than hammering or giving up.
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
const PERIODIC_MS = 30_000;

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'synced';

type Listener = (status: SyncStatus) => void;

class SyncManager {
  private inFlight = false;
  private failures = 0;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private listeners = new Set<Listener>();
  private status: SyncStatus = this.online ? 'online' : 'offline';
  // Briefly show "synced" after a successful drain, then settle back to "online".
  private syncedTimer: ReturnType<typeof setTimeout> | null = null;

  private get online(): boolean {
    // SSR/test guard; in the browser this reflects real connectivity.
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }

  // ─── Status pub/sub (for the light status UI) ──────────────────────────────

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(next: SyncStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const fn of this.listeners) fn(next);
  }

  // ─── Lifecycle: wire triggers once (app launch) ────────────────────────────

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    // Best-effort flush as the app is backgrounded/closed (product §8 triggers).
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('pagehide', this.handlePagehide);

    this.periodicTimer = setInterval(() => {
      if (this.online) void this.flush();
    }, PERIODIC_MS);

    void this.flush();
  }

  stop(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('pagehide', this.handlePagehide);
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    if (this.syncedTimer) clearTimeout(this.syncedTimer);
    this.periodicTimer = null;
    this.backoffTimer = null;
    this.syncedTimer = null;
    this.started = false;
  }

  private handleOnline = (): void => {
    this.failures = 0;
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
    this.setStatus('online');
    void this.flush();
  };

  private handleOffline = (): void => {
    this.setStatus('offline');
  };

  private handleVisibility = (): void => {
    if (document.visibilityState === 'hidden' && this.online) void this.flush();
  };

  private handlePagehide = (): void => {
    if (this.online) void this.flush();
  };

  // ─── Progress queue (resilient, last-write-wins) ───────────────────────────

  /**
   * Queue the latest progress snapshot for a profile (replaces any earlier un-synced
   * one — last-write-wins, product §8) and try to push it. Safe offline: it stays
   * queued and replays on the next flush.
   */
  async queueProgress(body: ProgressSyncRequest): Promise<void> {
    await db.progress.put({ profile_id: body.profile_id, body });
    void this.flush();
  }

  // ─── Draining ──────────────────────────────────────────────────────────────

  /**
   * Drain both queues. Single-flight: concurrent calls are coalesced. On a transient
   * failure the queues are kept and a backoff retry is scheduled; nothing is lost.
   */
  async flush(): Promise<void> {
    if (this.inFlight) return;
    if (!this.online) {
      this.setStatus('offline');
      return;
    }
    this.inFlight = true;
    this.setStatus('syncing');
    try {
      const drainedEvents = await this.drainEvents();
      const drainedProgress = await this.drainProgress();
      this.failures = 0;
      if (this.backoffTimer) {
        clearTimeout(this.backoffTimer);
        this.backoffTimer = null;
      }
      // Only flash "synced" if we actually pushed something; otherwise stay calm.
      if (drainedEvents || drainedProgress) this.flashSynced();
      else this.setStatus(this.online ? 'online' : 'offline');
    } catch (err) {
      // Transient (network / 5xx): keep everything queued and retry with backoff.
      this.scheduleRetry();
      this.setStatus(this.online ? 'online' : 'offline');
      if (import.meta.env?.DEV) console.warn('[sync] flush failed, will retry', err);
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * User-triggered "Sync now" (Settings button). Like `flush`, but RETURNS a
   * definitive result so the UI can show success/failure — `flush` swallows
   * errors for the background path. Reports how many events were waiting so the
   * parent gets concrete feedback ("12 sent"). Used to confirm a kid's offline
   * progress actually reached the server (e.g. multi-device reconciliation).
   */
  async syncNow(): Promise<{ ok: boolean; sentEvents: number; reason?: 'offline' | 'busy' | 'error' }> {
    if (!this.online) return { ok: false, sentEvents: 0, reason: 'offline' };
    if (this.inFlight) return { ok: false, sentEvents: 0, reason: 'busy' };
    const pending = await db.events.count();
    this.inFlight = true;
    this.setStatus('syncing');
    try {
      await this.drainEvents();
      await this.drainProgress();
      this.failures = 0;
      if (this.backoffTimer) {
        clearTimeout(this.backoffTimer);
        this.backoffTimer = null;
      }
      this.flashSynced();
      return { ok: true, sentEvents: pending };
    } catch (err) {
      this.scheduleRetry();
      this.setStatus(this.online ? 'online' : 'offline');
      if (import.meta.env?.DEV) console.warn('[sync] syncNow failed', err);
      return { ok: false, sentEvents: 0, reason: 'error' };
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Push buffered events in chunks of ≤ MAX_BATCH. Removes rows the server processed
   * (accepted + duplicates) and drops rejected ones after logging. Returns whether any
   * rows were sent. Throws on a transient failure so `flush` can back off.
   */
  private async drainEvents(): Promise<boolean> {
    let sentAny = false;
    // Re-read each loop so rows enqueued mid-flush are also drained.
    for (;;) {
      const queued = await db.events.orderBy('id').limit(MAX_BATCH).toArray();
      if (queued.length === 0) break;
      const result = await api.ingestEvents(queued.map((q) => q.envelope));
      sentAny = true;

      // Rejected = permanently invalid; report then drop so they can't wedge the queue.
      const rejectedSet = new Set(result.rejected);
      if (rejectedSet.size > 0 && import.meta.env?.DEV) {
        console.warn('[sync] server rejected events, dropping', result.rejected);
      }
      // Remove every row in this batch: accepted + duplicates + rejected are all
      // resolved (the server processed the request as a whole). Keeping them would
      // re-send forever. Anything still pending is in a later batch.
      await db.events.bulkDelete(queued.map((q) => q.id));

      if (queued.length < MAX_BATCH) break;
    }
    return sentAny;
  }

  /**
   * Replay queued progress snapshots (one per profile). A rejected (4xx) snapshot is
   * dropped — it's permanently invalid and would otherwise wedge the queue; transient
   * failures bubble up to trigger backoff.
   */
  private async drainProgress(): Promise<boolean> {
    const pending = await db.progress.toArray();
    if (pending.length === 0) return false;
    for (const row of pending) {
      try {
        await api.syncProgress(row.body);
        await db.progress.delete(row.profile_id);
      } catch (err) {
        // 401/403 = token expired/forbidden: keep it, resume after re-auth (product §8).
        // Other 4xx = the snapshot is permanently invalid; drop it so it can't wedge the
        // queue (a fresh snapshot supersedes it next lesson anyway — last-write-wins).
        if (err instanceof ApiError && isPermanentReject(err.status)) {
          if (import.meta.env?.DEV) console.warn('[sync] progress rejected, dropping', err);
          await db.progress.delete(row.profile_id);
          continue;
        }
        throw err; // transient (network / 5xx / auth) → back off and retry later
      }
    }
    return true;
  }

  private scheduleRetry(): void {
    this.failures += 1;
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (this.failures - 1), BACKOFF_MAX_MS);
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      if (this.online) void this.flush();
    }, delay);
  }

  private flashSynced(): void {
    this.setStatus('synced');
    if (this.syncedTimer) clearTimeout(this.syncedTimer);
    this.syncedTimer = setTimeout(() => {
      this.syncedTimer = null;
      this.setStatus(this.online ? 'online' : 'offline');
    }, 2_000);
  }
}

/** A 4xx that means the payload is invalid (drop it), excluding auth (keep + re-auth). */
function isPermanentReject(status: number): boolean {
  if (status === 401 || status === 403) return false;
  return status >= 400 && status < 500;
}

export const sync = new SyncManager();
