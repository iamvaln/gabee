import {
  IngestEventsRequestLenientSchema,
  EventEnvelopeSchema,
  type EventEnvelope,
  type IngestEventsResponse,
} from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { ingestEvents } from '@/lib/server/services/events';

export const runtime = 'nodejs';

// Matches the client-generated `event_id` shape (crypto.randomUUID) — only a
// real uuid can go in `rejected` (the client parses it as z.uuid()).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/events — LENIENT ingestion. We accept the batch as raw items and
// validate each event on its own: valid ones are persisted, malformed / old-
// schema ones are REJECTED by event_id (the client drops them). Never 422 the
// whole batch on one bad event — that would wedge the kid's offline queue (the
// drain retries the same batch forever, so nothing after the bad event uploads).
export const POST = route(async (req) => {
  const session = await requireParent(req);
  const { events: raw } = await readJson(req, IngestEventsRequestLenientSchema);

  const valid: EventEnvelope[] = [];
  const rejected: string[] = [];
  for (const item of raw) {
    const parsed = EventEnvelopeSchema.safeParse(item);
    if (parsed.success) {
      valid.push(parsed.data);
      continue;
    }
    // Report the id so the client can drop it — but only if it's a real uuid:
    // the response contract types `rejected` as uuid[], so a bogus id would fail
    // the client's parse and re-wedge the queue.
    const id = (item as { event_id?: unknown } | null)?.event_id;
    if (typeof id === 'string' && UUID_RE.test(id)) rejected.push(id);
  }

  const result = await ingestEvents(session.parentId, valid);
  return json<IngestEventsResponse>({ ...result, rejected: [...result.rejected, ...rejected] });
});
