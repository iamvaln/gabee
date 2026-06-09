import {
  ClaimPairCodeRequestSchema,
  type ClaimDevicePairResponse,
} from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import { claimByCode } from '@/lib/server/services/devices';

export const runtime = 'nodejs';

// POST /api/pair/claim-code — kid PWA exchanges a 6-char short_code for the
// same long-lived (~180d) device-bound parent-bearer JWT the link path mints.
//
// The defense-in-depth flow (parent spec, this change):
//   1. The parent app earlier created a DevicePairToken row carrying both
//      a one-shot JWT (link path) AND a 6-char shortCode tied to the
//      same row + the parent's account.
//   2. The kid device has the parent JWT (from email/password sign-in on
//      the kid device itself, NOT the long-lived bearer). `requireParent`
//      gates access to this route — without a valid parent JWT a kid (or
//      a snooping device) can't even attempt the code.
//   3. Rate-limit per parent — 5 attempts / 10 min — so the path can't be
//      brute-forced even with a valid parent JWT. Keyed on the parent ID
//      and not the IP, because the same household often shares one IP and
//      the relevant attacker is one with the parent's session (e.g. a
//      teenager grabbing the bearer).
export const POST = route(async (req) => {
  const session = await requireParent(req);
  rateLimit(`pair.code.${session.parentId}`, {
    scope: 'pair.code',
    limit: 5,
    windowMs: 10 * 60_000,
  });
  const input = await readJson(req, ClaimPairCodeRequestSchema);
  const result: ClaimDevicePairResponse = await claimByCode({
    parentId: session.parentId,
    rawCode: input.code,
    userAgentHint: input.user_agent_hint,
  });
  return json(result);
});
