import { route, json, requireParent } from '@/lib/server/http';
import { requestProfileIncrease } from '@/lib/server/services/profiles';
import { rateLimit, clientIpFrom } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

// POST /api/profiles/request-increase — a parent at the 3-profile cap asks the
// operator to raise it. Lands an InboxMessage (source `profile_increase_request`)
// in the admin Inbox so the operator has a trackable count. Rate-limited so the
// inbox can't be spammed by one parent hammering the button.
export const POST = route(async (req) => {
  const session = await requireParent(req);
  rateLimit(clientIpFrom(req), { scope: 'profile-increase', limit: 3, windowMs: 60 * 60_000 });
  await requestProfileIncrease(session.parentId);
  return json({ ok: true });
});
