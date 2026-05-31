import { AcceptCoparentInviteRequestSchema } from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { acceptCoparentInvite } from '@/lib/server/services/family';

export const runtime = 'nodejs';

// POST /api/family/accept — accept a co-parent invite as the currently
// authenticated parent. The session's email must match the invite's invitee
// (403 otherwise — the caller signs up / logs in to that email first).
export const POST = route(async (req) => {
  const session = await requireParent(req);
  const { token } = await readJson(req, AcceptCoparentInviteRequestSchema);
  const result = await acceptCoparentInvite(session.parentId, session.email, token);
  return json(result);
});
