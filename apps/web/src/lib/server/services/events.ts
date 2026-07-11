import { Prisma } from '@gabee/db';
import type { DeviceSnapshot, EventEnvelope, IngestEventsResponse } from '@gabee/types';
import { prisma } from '../db';
import { upsertDeviceFromSnapshot } from './devices-metadata';

/**
 * Batch event ingestion (product §9). Idempotent via the client `event_id` (offline
 * replays are counted, not re-stored). Events for a profile the caller doesn't own are
 * rejected. Session lifecycle events also maintain the parent's classification queue.
 */
export async function ingestEvents(
  parentId: string,
  events: EventEnvelope[],
  opts?: { device?: DeviceSnapshot; ip?: string | null },
): Promise<IngestEventsResponse> {
  const profileIds = [...new Set(events.map((e) => e.profile_id).filter((x): x is string => !!x))];
  const owned = profileIds.length
    ? await prisma.childProfile.findMany({
        where: { id: { in: profileIds }, parentId },
        select: { id: true },
      })
    : [];
  const ownedSet = new Set(owned.map((o) => o.id));

  const rejected: string[] = [];
  const rows = [];
  for (const env of events) {
    if (env.profile_id && !ownedSet.has(env.profile_id)) {
      rejected.push(env.event_id);
      continue;
    }
    rows.push({
      eventId: env.event_id,
      profileId: env.profile_id,
      sessionId: env.session_id,
      name: env.event.name,
      clientTs: new Date(env.client_ts),
      schemaVersion: env.schema_version,
      payload: env.event as unknown as Prisma.InputJsonValue,
    });
  }

  let accepted = 0;
  if (rows.length) {
    const result = await prisma.event.createMany({ data: rows, skipDuplicates: true });
    accepted = result.count;
  }

  await maintainClassificationQueue(events, ownedSet);

  if (opts?.device) {
    // Best-effort: metadata capture must never fail event ingestion.
    try {
      await upsertDeviceFromSnapshot(parentId, opts.device, opts.ip ?? null);
    } catch (err) {
      // Log the error CLASS only — never err.message (a Prisma message can echo
      // field values, incl. ip) / err / ip / ua.
      console.error('[events] device metadata upsert failed:', err instanceof Error ? err.name : 'unknown');
    }
  }

  return { accepted, duplicates: rows.length - accepted, rejected };
}

/** Surface new sessions to the parent and keep their context fresh (product §13.2). */
async function maintainClassificationQueue(
  events: EventEnvelope[],
  ownedSet: Set<string>,
): Promise<void> {
  for (const env of events) {
    if (!env.session_id || !env.profile_id || !ownedSet.has(env.profile_id)) continue;
    const sessionId = env.session_id;
    const e = env.event;

    if (e.name === 'session_start') {
      await prisma.sessionClassification.upsert({
        where: { sessionId },
        create: {
          sessionId,
          profileId: env.profile_id,
          startedAt: new Date(env.client_ts),
          tz: e.tz ?? null,
          tzOffsetMin: e.tz_offset_min ?? null,
        },
        update: { tz: e.tz ?? null, tzOffsetMin: e.tz_offset_min ?? null },
      });
    } else if (e.name === 'session_end') {
      await prisma.sessionClassification.updateMany({
        where: { sessionId },
        data: { durationS: e.duration_s },
      });
    } else if (e.name === 'lesson_started' || e.name === 'module_entered') {
      await prisma.sessionClassification.updateMany({
        where: { sessionId, firstModule: null },
        data: { firstModule: e.module },
      });
    }
  }
}
