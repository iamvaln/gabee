import type { PendingSessionsResponse } from '@gabee/types';
import { route, json, requireParent } from '@/lib/server/http';
import { listPending } from '@/lib/server/services/classifications';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  const session = await requireParent(req);
  const childId = new URL(req.url).searchParams.get('child_id') ?? undefined;
  const sessions = await listPending(session.parentId, childId);
  return json<PendingSessionsResponse>({ sessions });
});
