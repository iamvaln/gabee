import { route, json, requireParent } from '@/lib/server/http';
import { recordTermsConsent } from '@/lib/server/services/consent';

export const runtime = 'nodejs';

// POST /api/auth/accept-terms — records acceptance of the CURRENT terms
// version (see lib/terms.ts) for the authenticated parent. Used by the
// blocking re-consent gate (`/parent/terms-update`) after a version bump, and
// safe to call again later: each call appends a new ConsentRecord, it never
// updates one in place, so the history stays intact.
export const POST = route(async (req) => {
  const session = await requireParent(req);
  await recordTermsConsent(session.parentId);
  return json({ status: 'accepted' });
});
