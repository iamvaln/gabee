import { CreateCoparentInviteRequestSchema } from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { createCoparentInvite } from '@/lib/server/services/family';
import { IS_PROD } from '@/lib/server/env';

export const runtime = 'nodejs';

// POST /api/family/invites — create + email a co-parent invite (parent spec
// §9.2 / FAM2 / P3). The body returns the row plus, in dev, the JWT token
// itself so a developer without Mailgun wired can copy/paste the accept URL.
export const POST = route(async (req) => {
  const session = await requireParent(req);
  const input = await readJson(req, CreateCoparentInviteRequestSchema);

  // Build the accept URL from the request origin so the email link points
  // back to whatever host the parent is on (localhost in dev, parents.gabee.app
  // in prod). Fall back to the env `KID_APP_ORIGIN`-style override if a proxy
  // hides the original host.
  const origin =
    req.headers.get('origin') ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const { invite, token } = await createCoparentInvite(session.parentId, origin, input);
  return json(
    IS_PROD
      ? { invite }
      : { invite, dev_token: token, dev_accept_url: `${origin}/parent/coparent/accept?token=${encodeURIComponent(token)}` },
    201,
  );
});
