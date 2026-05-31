import { route, json, requireParent, HttpError } from '@/lib/server/http';
import { listFamilyActivity } from '@/lib/server/services/family-activity';
import type { FamilyActivityResponse } from '@gabee/types';

export const runtime = 'nodejs';

// GET /api/family/activity?child_id=<id>&limit=50&since=<iso>
//
// Returns the recent family activity feed for the requester, scoped to children
// they have access to via ParentChildLink (or the legacy ChildProfile.parentId
// back-compat path). `child_id` narrows to one kid; `since` filters strictly
// after the supplied ISO datetime; `limit` caps the row count (default 50).
export const GET = route(async (req) => {
  const session = await requireParent(req);
  const url = new URL(req.url);

  const childIdParam = url.searchParams.get('child_id');
  const limitParam = url.searchParams.get('limit');
  const sinceParam = url.searchParams.get('since');

  let limit: number | undefined;
  if (limitParam !== null) {
    const n = Number(limitParam);
    if (!Number.isFinite(n) || n <= 0) {
      throw new HttpError(422, 'validation_error', '`limit` must be a positive number');
    }
    limit = n;
  }

  if (sinceParam !== null && Number.isNaN(Date.parse(sinceParam))) {
    throw new HttpError(422, 'validation_error', '`since` must be an ISO datetime');
  }

  const response = await listFamilyActivity({
    requesterParentId: session.parentId,
    childIds: childIdParam ? [childIdParam] : undefined,
    limit,
    since: sinceParam ?? undefined,
  });
  return json<FamilyActivityResponse>(response);
});
