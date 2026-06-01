/**
 * Cross-host link helpers used by the landing CTAs.
 *
 * Why this exists: with the host-isolation middleware in `proxy.ts`, the
 * apex landing (`gabee.app`) returns 404 for `/parent/*` paths — those live
 * on the `parents.gabee.app` subdomain. The TopBar / Hero / Pricing / Footer
 * CTAs therefore need an ABSOLUTE link to the parent app in prod, but a
 * RELATIVE link in dev (where everything is on `localhost:3000`).
 *
 * `NEXT_PUBLIC_PARENT_APP_URL` is inlined at build time:
 *   - unset (dev)  → returns `/parent/login`, `/parent/signup` (relative)
 *   - `https://parents.gabee.app` (prod) → returns absolute URLs without
 *     the `/parent` prefix (the proxy.ts rewrite handles it)
 */
const PARENT_BASE = (process.env.NEXT_PUBLIC_PARENT_APP_URL ?? '').replace(/\/$/, '');

function buildHref(absolutePath: string, relativePath: string): string {
  return PARENT_BASE ? `${PARENT_BASE}${absolutePath}` : relativePath;
}

export function parentLoginHref(): string {
  return buildHref('/login', '/parent/login');
}

export function parentSignupHref(): string {
  return buildHref('/signup', '/parent/signup');
}
