import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { corsHeaders } from '@/lib/server/cors';
import { routing } from '@/lib/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

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
    return new NextResponse('Not Found', { status: 404 });
  }

  // CORS for the cross-origin kid PWA (covers api. and local path-based calls).
  if (pathname.startsWith('/api')) {
    const headers = corsHeaders(req.headers.get('origin'));
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers });
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return res;
  }

  if (sub === 'parents' && !pathname.startsWith('/parent')) {
    return NextResponse.rewrite(new URL(`/parent${pathname === '/' ? '' : pathname}`, req.url));
  }
  if (sub === 'admin' && !pathname.startsWith('/admin')) {
    return NextResponse.rewrite(new URL(`/admin${pathname === '/' ? '' : pathname}`, req.url));
  }

  // Landing & legal pages — defer to next-intl for locale negotiation, cookie
  // persistence and redirects (/ → /fr by default, /en kept as-is, etc.).
  if (!isAppPath(pathname)) {
    return intlMiddleware(req);
  }

  // App-path passthrough: forward the current pathname as a REQUEST header so
  // downstream Server Components can branch on it via `headers()` — used by
  // the admin layout to skip its gated shell on `/admin/login`.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
