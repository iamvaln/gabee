import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { corsHeaders } from '@/lib/server/cors';
import { routing } from '@/lib/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

// ─── Security headers ────────────────────────────────────────────────────────
// Applied to every response. CSP is the load-bearing one: it constrains where
// scripts/styles/images may come from, hard-killing most XSS exploitation paths
// even when a sink slips through. Notes:
//   - script-src: 'self' + 'unsafe-inline'. Next.js's App Router INLINES a
//     bootstrap script (and bunches of hydration data + HMR runtime in dev) on
//     EVERY page. Without 'unsafe-inline' React never hydrates, so click
//     handlers never attach — buttons hover but don't respond. The proper
//     fix is per-request nonces emitted from middleware and read back on the
//     server, but that's surgery we'll do later; for MVP we accept the looser
//     script-src in exchange for a working app. Inline-script XSS is still
//     blunted by escaping in React + the rest of the headers below.
//   - style-src: includes 'unsafe-inline' because Tailwind v4 + next-intl emit
//     style attributes / <style> blocks at runtime. Style injection is far less
//     dangerous than script injection.
//   - connect-src: includes the Vercel Live websocket (used by next dev's HMR
//     and the React DevTools bridge) so dev mode doesn't spam the console.
//   - frame-ancestors 'none' replaces X-Frame-Options for modern browsers, but
//     we keep the legacy header too for older clients.
//   - upgrade-insecure-requests: forces any http:// subresource to https:// at
//     the browser, defence-in-depth on top of HSTS.
const isDev = process.env.NODE_ENV !== 'production';
const CSP = [
  "default-src 'self'",
  // `unsafe-eval` is needed by Turbopack/webpack dev runtimes (HMR uses Function
  // ctor). Dropped in prod.
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  // Dev needs the HMR websocket + the Next /_next/* fetch endpoints (same-origin
  // so 'self' covers them); add `ws:` and `wss:` explicitly so Safari behaves.
  isDev
    ? "connect-src 'self' ws: wss:"
    : "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // `upgrade-insecure-requests` is a prod-only protection: in dev it makes the
  // browser fetch http://localhost:3000 via https:// and fail with
  // ERR_SSL_PROTOCOL_ERROR. HSTS already handles the upgrade for prod traffic.
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

// Paths that are explicitly app-surfaces (not the landing): skip next-intl
// entirely so the existing parent/admin/api routes keep working AND so static
// assets in /public don't get rewritten to /fr/<asset>. The favicon set is
// referenced from <head> with absolute root paths (/favicon-32.png …); if
// next-intl prefixes them with the active locale, the browser fetches a path
// that doesn't exist.
const FAVICON_PATHS = new Set([
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/favicon-48.png',
  '/favicon-180.png',
  '/favicon-512.png',
  '/apple-touch-icon.png',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
]);
function isAppPath(pathname: string): boolean {
  return (
    pathname.startsWith('/parent') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    FAVICON_PATHS.has(pathname)
  );
}

type HostRole = 'apex' | 'parents' | 'admin' | 'api' | 'localhost' | 'unknown';

// The apex/landing host, derived from the parent-app URL. NEXT_PUBLIC_* is inlined
// at build time, so this is available in the Edge middleware (runtime env is not).
// Prod → `gabee.app`; staging → `staging.gabee.app`. Lets the BARE apex be
// recognized even when it has >2 dot-parts (staging), which the dot-count fallback
// below can't. Empty in dev (localhost is handled separately).
const APEX_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_PARENT_APP_URL ?? '').hostname.replace(/^parents\./, '');
  } catch {
    return '';
  }
})();

/**
 * Classify the request host into one of the public surfaces. Local
 * development always returns `'localhost'` so dev keeps the relaxed
 * path-based behaviour; `unknown` (raw IP probes, unknown subdomains)
 * is a hard 404.
 */
function hostRole(host: string): HostRole {
  const hostname = (host.split(':')[0] ?? '').toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    /^127\.\d+\.\d+\.\d+$/.test(hostname) ||
    // Single-label hostnames (no dot) — Docker compose internal DNS aliases
    // like `web` or `db`. In prod, Traefik's router rules only match dotted
    // public hostnames (`gabee.app`, `parents.gabee.app`, …), so a request
    // reaching the web container with a single-label Host can ONLY be from
    // inside the Docker network (cron-digest → web). Treat as localhost so
    // internal HTTP works without explicit Host-header rewriting at the
    // caller. Externally-spoofed `Host: web` requests don't reach the
    // container in the first place — Traefik 404s them at the edge.
    !hostname.includes('.')
  ) {
    return 'localhost';
  }
  // Classify by the LEADING label, independent of base-domain depth, so this
  // works for both prod (`parents.gabee.app`) and staging
  // (`parents.staging.gabee.app`). Traefik only routes the known hosts to this
  // container, so a broader match here doesn't weaken the cross-host barrier.
  const parts = hostname.split('.');
  switch (parts[0]) {
    case 'www':
      return 'apex';
    case 'parents':
      return 'parents';
    case 'admin':
      return 'admin';
    case 'api':
      return 'api';
  }
  // The configured apex host (prod `gabee.app` or staging `staging.gabee.app`).
  if (APEX_HOST && hostname === APEX_HOST) return 'apex';
  // Fallback: a bare two-part host (prod `gabee.app`). A deeper unknown subdomain
  // is a 404.
  if (parts.length === 2) return 'apex';
  return 'unknown';
}

/**
 * Path allowlist per host role. Returns false → 404. The cross-host
 * barrier is the whole point: an admin URL on parents.gabee.app, or a
 * parent URL on admin.gabee.app, never reaches its handler.
 *
 * Asset paths (`/_next/*`, the favicon set, manifest, robots) are universal.
 */
function isPathAllowed(role: HostRole, pathname: string): boolean {
  if (role === 'localhost') return true;
  if (pathname.startsWith('/_next')) return true;
  if (FAVICON_PATHS.has(pathname)) return true;

  switch (role) {
    case 'apex':
      // Marketing surface — landing + legal + contact-form API endpoint.
      if (pathname.startsWith('/parent')) return false;
      if (pathname.startsWith('/admin')) return false;
      if (pathname.startsWith('/api') && pathname !== '/api/contact') return false;
      return true;
    case 'parents':
      // Parent dashboard host. /parent pages + every /api route (the
      // parent surface calls many of them same-origin; easier to allow
      // all than enumerate). /admin is blocked outright.
      if (pathname.startsWith('/admin')) return false;
      return true;
    case 'admin':
      // Admin back office. Mirror of `parents` but blocking /parent.
      if (pathname.startsWith('/parent')) return false;
      return true;
    case 'api':
      // API-only subdomain. No HTML pages here.
      return pathname.startsWith('/api');
    case 'unknown':
    default:
      return false;
  }
}

/**
 * Host-based routing (product §11.3), Next 16 "proxy" convention. One
 * deployment serves every subdomain:
 *   api.     → only /api/* (+ CORS for the kid origin)
 *   parents. → /parent/* (plus the API routes parent surfaces call)
 *   admin.   → /admin/*  (plus the API routes admin surfaces call)
 *   apex     → marketing (next-intl localised) + /api/contact
 * Locally (`localhost`) the enforcement is disabled — dev keeps path-based
 * routing so a single `pnpm dev` covers every surface.
 */
export function proxy(req: NextRequest): NextResponse {
  const host = req.headers.get('host') ?? '';
  const role = hostRole(host);
  const sub = host.split(':')[0]?.split('.')[0] ?? '';
  const { pathname } = req.nextUrl;

  // Host enforcement — the surface barrier. Localhost short-circuits.
  if (!isPathAllowed(role, pathname)) {
    return applySecurityHeaders(new NextResponse('Not Found', { status: 404 }));
  }

  // CORS for the cross-origin kid PWA (covers api. and local path-based calls).
  if (pathname.startsWith('/api')) {
    const headers = corsHeaders(req.headers.get('origin'));
    if (req.method === 'OPTIONS') {
      return applySecurityHeaders(new NextResponse(null, { status: 204, headers }));
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return applySecurityHeaders(res);
  }

  // Surface rewrites: `parents.gabee.app/login` → internally `/parent/login`
  // so the parent app's pages serve naturally. Same idea for admin.
  // Universal root assets (favicon set, robots, sitemap, manifest) must NOT be
  // rewritten under /parent or /admin — they live at the public root, so a
  // rewrite would 404 them on the subdomains.
  if (sub === 'parents' && !pathname.startsWith('/parent') && !FAVICON_PATHS.has(pathname)) {
    return applySecurityHeaders(
      NextResponse.rewrite(new URL(`/parent${pathname === '/' ? '' : pathname}`, req.url)),
    );
  }
  if (sub === 'admin' && !pathname.startsWith('/admin') && !FAVICON_PATHS.has(pathname)) {
    return applySecurityHeaders(
      NextResponse.rewrite(new URL(`/admin${pathname === '/' ? '' : pathname}`, req.url)),
    );
  }

  // Landing & legal pages — defer to next-intl for locale negotiation, cookie
  // persistence and redirects (/ → /fr by default, /en kept as-is, etc.).
  if (!isAppPath(pathname)) {
    const intlRes = intlMiddleware(req);
    return applySecurityHeaders(intlRes);
  }

  // App-path passthrough: forward the current pathname as a REQUEST header so
  // downstream Server Components can branch on it via `headers()` — used by
  // the admin layout to skip its gated shell on `/admin/login`.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
