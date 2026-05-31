import { IngestEventsRequestSchema, type IngestEventsResponse } from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { ingestEvents } from '@/lib/server/services/events';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const session = await requireParent(req);
  const { events } = await readJson(req, IngestEventsRequestSchema);
  const result = await ingestEvents(session.parentId, events);
  return json<IngestEventsResponse>(result);
});
