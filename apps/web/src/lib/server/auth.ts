import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type NextRequest, type NextResponse } from 'next/server';
import { prisma } from './db';
import { AUTH_JWT_SECRET, IS_PROD, SESSION_COOKIE, SESSION_TTL_SECONDS } from './env';

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
export async function getSession(req: NextRequest): Promise<SessionClaims | null> {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return verifySessionToken(auth.slice('Bearer '.length).trim());
  }
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) return verifySessionToken(cookie);
  return null;
}

/** Read the session from the cookie store in a Server Component / Server Action. */
export async function getServerSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
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
  const session = await getServerSession();
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
  const session = await getServerSession();
  if (!session) redirect('/admin/login?next=%2Fadmin');
  const account = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { role: true },
  });
  if (!account) redirect('/admin/login?next=%2Fadmin');
  if (account.role !== 'admin' && account.role !== 'super_admin') redirect('/parent');
  return { ...session, role: account.role };
}

export const sessionCookieName = SESSION_COOKIE;
export const sessionCookieMaxAge = SESSION_TTL_SECONDS;

/** Set the httpOnly session cookie (web, same-origin) on a response. */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Clear the session cookie (logout). */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
