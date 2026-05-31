import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { corsHeaders } from '@/lib/server/cors';
import { routing } from '@/lib/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

// ─── Security headers ────────────────────────────────────────────────────────
// Applied to every response. CSP is the load-bearing one: it constrains where
// scripts/styles/images may come from, hard-killing most XSS exploitation paths
// even when a sink slips through. Notes:
//   - script-src: 'self' only — no 'unsafe-inline' (RSC inlines hydration data,
//     but Next ships it under a hash; Next 16's App Router emits compatible
//     hashes for its own scripts).
//   - style-src: includes 'unsafe-inline' because Tailwind v4 + next-intl emit
//     style attributes / <style> blocks at runtime. Style injection is far less
//     dangerous than script injection.
//   - frame-ancestors 'none' replaces X-Frame-Options for modern browsers, but
//     we keep the legacy header too for older clients.
//   - upgrade-insecure-requests: forces any http:// subresource to https:// at
//     the browser, defence-in-depth on top of HSTS.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
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

// Paths that are explicitly app-surfaces (not the landing): skip next-intl entirely
// so the existing parent/admin/api routes keep working.
function isAppPath(pathname: string): boolean {
  return (
    pathname.startsWith('/parent') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  );
}

/**
 * Host-based routing (product §11.3), Next 16 "proxy" convention. One deployment
 * serves every subdomain:
 *   api.     → only /api/* (+ CORS for the kid origin)
 *   parents. → /parent/*
 *   admin.   → /admin/*
 *   apex     → marketing (next-intl localised) + (in local dev, path-based /parent, /admin)
 * Locally there are no subdomains, so we route by path and still apply CORS to /api.
 */
export function proxy(req: NextRequest): NextResponse {
  const host = req.headers.get('host') ?? '';
  const hostname = host.split(':')[0] ?? '';
  const sub = hostname.split('.')[0] ?? '';
  const { pathname } = req.nextUrl;

  // On the api host, page routes don't exist.
  if (sub === 'api' && !pathname.startsWith('/api')) {
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

  if (sub === 'parents' && !pathname.startsWith('/parent')) {
    return applySecurityHeaders(
      NextResponse.rewrite(new URL(`/parent${pathname === '/' ? '' : pathname}`, req.url)),
    );
  }
  if (sub === 'admin' && !pathname.startsWith('/admin')) {
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
