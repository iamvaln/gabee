import { CreateCoparentInviteRequestSchema } from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { createCoparentInvite } from '@/lib/server/services/family';
import { IS_PROD } from '@/lib/server/env';
import { getPublicAppUrl } from '@/lib/server/public-url';

export const runtime = 'nodejs';

// POST /api/family/invites — create + email a co-parent invite (parent spec
// §9.2 / FAM2 / P3). The body returns the row plus, in dev, the JWT token
// itself so a developer without Mailgun wired can copy/paste the accept URL.
export const POST = route(async (req) => {
  const session = await requireParent(req);
  const input = await readJson(req, CreateCoparentInviteRequestSchema);

  // Build the accept URL from the public-facing origin so the email link
  // resolves whatever the recipient clicks (localhost in dev,
  // parents.gabee.app in prod). See `public-url.ts` for the resolution
  // order — `PARENT_APP_URL` overrides everything when set.
  const origin = getPublicAppUrl(req);

  const { invite, token } = await createCoparentInvite(session.parentId, origin, input);
  return json(
    IS_PROD
      ? { invite }
      : { invite, dev_token: token, dev_accept_url: `${origin}/parent/coparent/accept?token=${encodeURIComponent(token)}` },
    201,
  );
});
