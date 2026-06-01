import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type NextRequest, type NextResponse } from 'next/server';
import { prisma } from './db';
import {
  AUTH_JWT_SECRET,
  IS_PROD,
  PARENT_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
  LEGACY_SESSION_COOKIE,
  COOKIE_DOMAIN_PARENT,
  COOKIE_DOMAIN_ADMIN,
  SESSION_TTL_SECONDS,
} from './env';

/**
 * Which auth surface a session is tied to. The login route picks this based
 * on the authenticated account's role: admins get `'admin'`, everyone else
 * (parent role) gets `'parent'`. Drives which cookie name + Domain scope is
 * used, so an admin cookie never reaches parents.gabee.app and a parent
 * cookie reaches both parents.gabee.app + kids.gabee.app.
 */
export type SessionSurface = 'parent' | 'admin';

// ─── Password hashing (scrypt — built-in, no native dep) ─────────────────────

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

/** Hash a password with a fresh random salt. Returns hex hash + hex salt. */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN);
  return { hash: derived.toString('hex'), salt: salt.toString('hex') };
}

/** Constant-time verify of a password against a stored hash + salt. */
export async function verifyPassword(
  password: string,
  hashHex: string,
  saltHex: string,
): Promise<boolean> {
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, salt, expected.length || KEYLEN);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// ─── Session JWTs (jose, HS256) ──────────────────────────────────────────────

const secret = new TextEncoder().encode(AUTH_JWT_SECRET);

export interface SessionClaims {
  parentId: string;
  email: string;
}

/** Mint a session token. Returns the JWT and its absolute expiry. */
export async function createSessionToken(
  claims: SessionClaims,
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const token = await new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.parentId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, expiresAt };
}

async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return { parentId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

/**
 * Extract the session from a request: Authorization bearer (kid PWA, cross-origin)
 * takes precedence, then the httpOnly session cookie (web, same-origin).
 */
/**
 * Resolve the session from a request. Order of precedence:
 *   1. Bearer token (kid PWA, cross-origin) — always wins.
 *   2. The cookie matching the requested `surface` (parent or admin).
 *   3. Either new cookie when `surface` is undefined — used by neutral
 *      endpoints like `/api/auth/me` that don't know in advance which
 *      surface the caller belongs to.
 *   4. The legacy `gabee_session` cookie — kept for the short migration
 *      window where existing users still hold it before their next login.
 */
export async function getSession(
  req: NextRequest,
  surface?: SessionSurface,
): Promise<SessionClaims | null> {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return verifySessionToken(auth.slice('Bearer '.length).trim());
  }
  const names = cookieNamesForSurface(surface);
  for (const name of names) {
    const token = req.cookies.get(name)?.value;
    if (!token) continue;
    const session = await verifySessionToken(token);
    if (session) return session;
  }
  return null;
}

/** Read the session from the cookie store in a Server Component / Server Action. */
export async function getServerSession(
  surface?: SessionSurface,
): Promise<SessionClaims | null> {
  const store = await cookies();
  const names = cookieNamesForSurface(surface);
  for (const name of names) {
    const token = store.get(name)?.value;
    if (!token) continue;
    const session = await verifySessionToken(token);
    if (session) return session;
  }
  return null;
}

function cookieNamesForSurface(surface: SessionSurface | undefined): string[] {
  // Always fall through to the legacy cookie last — covers the brief
  // migration where pre-deploy users still hold `gabee_session`.
  if (surface === 'admin') return [ADMIN_SESSION_COOKIE, LEGACY_SESSION_COOKIE];
  if (surface === 'parent') return [PARENT_SESSION_COOKIE, LEGACY_SESSION_COOKIE];
  return [PARENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE, LEGACY_SESSION_COOKIE];
}

export type AdminRole = 'admin' | 'super_admin';

export interface AdminSession extends SessionClaims {
  role: AdminRole;
}

/**
 * Gate a parent Server Component: redirects to login when there's no session OR when
 * the session JWT is signature-valid but its parentId no longer exists (e.g. the
 * account was deleted, or the dev DB was reset and the browser still holds an old
 * cookie). The cookie isn't cleared here — Server Components can't mutate cookies —
 * but a successful re-login will overwrite it. The `?next=/parent` parameter lets
 * the login page bring you back here once you authenticate.
 */
export async function requireParentPage(): Promise<SessionClaims> {
  const session = await getServerSession('parent');
  if (!session) redirect('/parent/login?next=%2Fparent');
  const exists = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { id: true },
  });
  if (!exists) redirect('/parent/login?next=%2Fparent');
  return session;
}

/**
 * Gate an admin Server Component: redirects to the admin sign-in when there's no
 * session OR the account no longer exists (same stale-cookie case as above), and
 * to the parent home when the account is non-admin (admin spec §2). The admin
 * surface lives at its own `/admin/login` URL (separate from parent login,
 * because `admin.gabee.app` is its own host in production). Returns the session
 * + role so pages can hide super_admin-only actions.
 */
export async function requireAdminPage(): Promise<AdminSession> {
  const session = await getServerSession('admin');
  if (!session) redirect('/admin/login?next=%2Fadmin');
  const account = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { role: true },
  });
  if (!account) redirect('/admin/login?next=%2Fadmin');
  if (account.role !== 'admin' && account.role !== 'super_admin') redirect('/parent');
  return { ...session, role: account.role };
}

export const sessionCookieMaxAge = SESSION_TTL_SECONDS;

/**
 * Set the httpOnly session cookie keyed on the surface the user signed into.
 *  - `'parent'` → `gabee_parent_session` cookie scoped to
 *    `COOKIE_DOMAIN_PARENT` (e.g. `.gabee.app`) so it reaches parents +
 *    kids + apex.
 *  - `'admin'`  → `gabee_admin_session` cookie scoped to
 *    `COOKIE_DOMAIN_ADMIN` (e.g. `admin.gabee.app`) — admin only.
 *
 * Without `COOKIE_DOMAIN_*` (dev), each cookie gets no Domain attribute so
 * it's scoped to the exact host (localhost), matching today's behaviour.
 */
export function setSessionCookie(
  res: NextResponse,
  token: string,
  surface: SessionSurface,
): void {
  const name = surface === 'admin' ? ADMIN_SESSION_COOKIE : PARENT_SESSION_COOKIE;
  const domain = surface === 'admin' ? COOKIE_DOMAIN_ADMIN : COOKIE_DOMAIN_PARENT;
  res.cookies.set({
    name,
    value: token,
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    ...(domain ? { domain } : {}),
  });
}

/**
 * Clear every session cookie the browser might hold for Gabee — both new
 * names plus the legacy one. Safe to call without knowing which surface
 * the user is on.
 */
export function clearSessionCookie(res: NextResponse): void {
  const targets: { name: string; domain: string | undefined }[] = [
    { name: ADMIN_SESSION_COOKIE, domain: COOKIE_DOMAIN_ADMIN },
    { name: PARENT_SESSION_COOKIE, domain: COOKIE_DOMAIN_PARENT },
    { name: LEGACY_SESSION_COOKIE, domain: undefined },
  ];
  for (const t of targets) {
    res.cookies.set({
      name: t.name,
      value: '',
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      ...(t.domain ? { domain: t.domain } : {}),
    });
  }
}

