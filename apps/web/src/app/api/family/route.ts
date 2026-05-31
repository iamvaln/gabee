import type { FamilyPanelResponse } from '@gabee/types';
import { route, json, requireParent } from '@/lib/server/http';
import { getFamilyPanel } from '@/lib/server/services/family';

export const runtime = 'nodejs';

// GET /api/family — FAM1 panel data (parent spec §9.1). Returns every parent
// linked to ANY of the requester's children + the requester's pending invites.
export const GET = route(async (req) => {
  const session = await requireParent(req);
  const panel: FamilyPanelResponse = await getFamilyPanel(session.parentId);
  return json(panel);
});
