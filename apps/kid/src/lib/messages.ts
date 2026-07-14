import { db, type LocalMessage } from './db';
import { api } from './api';
import { enqueueEvent } from './events';

/**
 * Parent → kid message queue (changes-v1 §1, parent spec §8.4).
 *
 * Flow:
 *  - The kid app polls `/api/messages/pending` at `session_start` and on hub mount.
 *  - Results are upserted into Dexie (`messages` table) so the bandeau persists
 *    across reloads + offline reopens.
 *  - At the end of every lesson, the oldest unread message becomes the bandeau.
 *  - Persistence: if the kid taps "Play again" instead of the bandeau, the row stays
 *    `unread` in Dexie — `getUnreadQueue` returns it again at the NEXT summary.
 *  - On Continue tap → markRead: API call → row status='read' in Dexie → emit the
 *    `parent_message_read` event (the API also writes it server-side as belt-and-
 *    braces).
 */

/** Fetch the server's pending list for this child. Caller decides when to call. */
export async function fetchPending(childId: string): Promise<LocalMessage[]> {
  const res = await api.getPendingMessages(childId);
  return res.messages.map((m) => ({
    id: m.id,
    fromParentId: m.from_parent_id,
    fromDisplayName: m.from_display_name,
    text: m.text,
    createdAt: m.created_at,
    status: 'unread' as const,
  }));
}

/**
 * Refresh the Dexie cache from the server. Upserts new rows and drops any locally
 * cached unread rows that the server no longer returns (deleted by the sender) so
 * a retracted note doesn't surface to the kid.
 */
export async function refreshPending(childId: string): Promise<void> {
  let server: LocalMessage[];
  try {
    server = await fetchPending(childId);
  } catch {
    // Offline or transient — keep whatever's cached. The next refresh will reconcile.
    return;
  }
  const serverIds = new Set(server.map((m) => m.id));

  // Preserve any locally tracked deliveredAt so the bandeau-shown moment survives
  // re-fetches (deliveredAt → tap is the precise TTR source).
  const existing = await db.messages.toArray();
  const existingById = new Map(existing.map((m) => [m.id, m]));

  await db.transaction('rw', db.messages, async () => {
    for (const m of server) {
      const prev = existingById.get(m.id);
      await db.messages.put({
        ...m,
        deliveredAt: prev?.deliveredAt,
        status: prev?.status === 'read' ? 'read' : 'unread',
      });
    }
    // Withdraw rows the server has retracted (deleted) but that we still hold as unread.
    for (const m of existing) {
      if (m.status === 'unread' && !serverIds.has(m.id)) {
        await db.messages.delete(m.id);
      }
    }
  });
}

/** Oldest-first unread messages, ready to surface between lessons. */
export async function getUnreadQueue(): Promise<LocalMessage[]> {
  const rows = await db.messages.where('status').equals('unread').sortBy('createdAt');
  return rows;
}

/** Record the moment the bandeau first appeared — used for the TTR computation. */
export async function markDelivered(messageId: string): Promise<{ firstTime: boolean }> {
  const row = await db.messages.get(messageId);
  if (!row) return { firstTime: false };
  if (row.deliveredAt) return { firstTime: false };
  await db.messages.update(messageId, { deliveredAt: Date.now() });
  return { firstTime: true };
}

/**
 * Mark a message read on the server + locally. Emits the read event (envelope) into
 * the offline queue. The server route ALSO writes the event so we don't lose it if
 * the kid app is killed before its events flush.
 */
export async function markRead(
  messageId: string,
  ctx: { profileId: string; sessionId: string | null },
): Promise<void> {
  const row = await db.messages.get(messageId);
  try {
    await api.markMessageRead(messageId);
  } catch {
    // Even if the API call fails, advance locally so the kid isn't stuck on the
    // reader. The pending poll will reconcile next time we sync (the server row
    // will then be 'read' — or 'deleted' — and the bandeau won't reappear).
  }
  const deliveredAt = row?.deliveredAt ?? null;
  await db.messages.update(messageId, { status: 'read' });
  await enqueueEvent(
    {
      name: 'parent_message_read',
      child_id: ctx.profileId,
      message_id: messageId,
      time_to_read_ms: deliveredAt ? Math.max(0, Date.now() - deliveredAt) : 0,
    },
    { profileId: ctx.profileId, sessionId: ctx.sessionId },
  );
}
