import { ProgressSyncRequestSchema, type ProgressSyncResponse } from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { syncProgress } from '@/lib/server/services/progress';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const session = await requireParent(req);
  const body = await readJson(req, ProgressSyncRequestSchema);
  const result = await syncProgress(session.parentId, body);
  return json<ProgressSyncResponse>(result);
});
