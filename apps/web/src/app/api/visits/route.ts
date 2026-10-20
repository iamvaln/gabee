import { NextResponse } from 'next/server';
import { VisitBeaconSchema } from '@gabee/types';
import { route, readJson, HttpError } from '@/lib/server/http';
import { rateLimit, clientIpFrom } from '@/lib/server/rate-limit';
import { getStudioTimezone, ownHostsFromEnv, recordVisit } from '@/lib/server/services/web-visits';

export const runtime = 'nodejs';

/**
 * POST /api/visits — first-party landing visit counter. No auth (anonymous
 * landing traffic), same-origin only, rate limited per IP. The IP is used for
 * the limiter bucket and never stored. Answers 204 for stored visits, bots and
 * (client side) Do-Not-Track alike.
 */
export const POST = route(async (req) => {
  rateLimit(clientIpFrom(req), { scope: 'visits', limit: 120, windowMs: 60_000 });

  const ownHosts = ownHostsFromEnv();
  // sendBeacon from the same origin may omit Origin on some browsers; a present
  // Origin must be one of ours.
  const origin = req.headers.get('origin');
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).hostname.toLowerCase();
    } catch {
      // falls through to the rejection below
    }
    if (!ownHosts.includes(host)) {
      throw new HttpError(403, 'forbidden_origin', 'This origin is not allowed to send visits.');
    }
  }

  const beacon = await readJson(req, VisitBeaconSchema);
  await recordVisit(beacon, {
    userAgent: req.headers.get('user-agent') ?? '',
    now: new Date(),
    timezone: await getStudioTimezone(),
    ownHosts,
  });
  return new NextResponse(null, { status: 204 });
});
