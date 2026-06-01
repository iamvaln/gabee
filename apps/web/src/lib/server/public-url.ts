import type { NextRequest } from 'next/server';
import { PARENT_APP_URL } from './env';

/**
 * Resolve the public-facing origin of the parent web app. Used to mint
 * absolute links in outbound emails (password reset, email confirmation,
 * co-parent invite) — the kind of URL the recipient must be able to open
 * from their inbox, regardless of how the request reached our process.
 *
 * Resolution order, from most-trusted to last-resort:
 *
 *   1. `PARENT_APP_URL` env. In prod this is the right answer — set it to
 *      e.g. `https://parents.gabee.app` and you're done. Survives any
 *      proxy / NAT / weird header dance because it's not derived from the
 *      request at all.
 *
 *   2. Forwarded headers (`x-forwarded-host` + `x-forwarded-proto`). The
 *      conventional way for a reverse proxy (Traefik, nginx, Cloudflare)
 *      to tell the origin what the user actually typed. Trustworthy ONLY
 *      when the proxy strips/overwrites these on inbound — we assume it
 *      does because the proxy is the only ingress.
 *
 *   3. The `Origin` request header. Browsers set this on cross-origin
 *      requests; same-origin POSTs don't. Useful when the call came from
 *      the parent app's own front-end fetch.
 *
 *   4. Final fallback: `req.nextUrl` (a.k.a `new URL(req.url)`). This is
 *      whatever Next.js parsed from the incoming socket — in prod behind
 *      Traefik it tends to look like `http://localhost:3000`, which is
 *      WRONG for an outbound link. Treat as a last resort to avoid
 *      crashing; warn loudly so a misconfiguration shows up in the logs.
 *
 * The returned string never has a trailing slash, so callers can build
 * paths with simple template concatenation: `${origin}/parent/...`.
 */
export function getPublicAppUrl(req: NextRequest): string {
  // 1. Explicit env override — always wins.
  if (PARENT_APP_URL) return stripTrail(PARENT_APP_URL);

  // 2. Standard reverse-proxy forwarded headers.
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    const proto = (forwardedProto?.split(',')[0]?.trim() || 'https').toLowerCase();
    const host = forwardedHost.split(',')[0]?.trim();
    if (host) return `${proto}://${host}`;
  }

  // 3. Browser-set Origin (cross-origin fetches).
  const origin = req.headers.get('origin');
  if (origin && /^https?:\/\//.test(origin)) return stripTrail(origin);

  // 4. Last resort: whatever Next parsed. Often wrong in prod (looks like
  // localhost behind a proxy). Log so a misconfigured deploy surfaces in
  // the dashboard instead of just shipping broken email links.
  const fallback = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      `[public-url] fell back to req.nextUrl (${fallback}). Set PARENT_APP_URL in env, or have your proxy emit X-Forwarded-Host / X-Forwarded-Proto, to make outbound email links stable in prod.`,
    );
  }
  return fallback;
}

function stripTrail(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}
