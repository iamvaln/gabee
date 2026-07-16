/**
 * Layer-3 (route handler) test helper: mint a real session JWT and build a
 * NextRequest carrying it as the httpOnly parent session cookie. Later
 * route-level integration tests should copy this pattern rather than
 * hand-rolling cookie headers.
 */
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/server/auth';
import { PARENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE } from '@/lib/server/env';

export async function parentToken(parentId: string, email: string): Promise<string> {
  return (await createSessionToken({ parentId, email })).token;
}

export function authedRequest(url: string, token: string | null, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { cookie: `${PARENT_SESSION_COOKIE}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export function parentCookie(token: string): { name: string; value: string } {
  return { name: PARENT_SESSION_COOKIE, value: token };
}

export function adminCookie(token: string): { name: string; value: string } {
  return { name: ADMIN_SESSION_COOKIE, value: token };
}

/**
 * General-purpose request builder for auth/pairing integration tests, where
 * different routes need different auth shapes (parent cookie, admin cookie,
 * bearer token, or none). `authedRequest` above stays as-is for existing
 * parent-cookie-only callers.
 *
 * Every request gets a unique `x-forwarded-for` unless `ip` is given —
 * `clientIpFrom` in `lib/server/rate-limit.ts` (and `getRequestMeta` in
 * `request-meta.ts`) both key off X-Forwarded-For's first hop, so without
 * this, back-to-back tests hitting a rate-limited route would bleed into
 * each other's buckets.
 */
export function webRequest(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
    cookie?: { name: string; value: string };
    bearer?: string;
    ip?: string;
  } = {},
): NextRequest {
  const headers: Record<string, string> = {
    'x-forwarded-for': opts.ip ?? `10.${randomBytes(3).join('.')}`,
  };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.cookie) headers['cookie'] = `${opts.cookie.name}=${opts.cookie.value}`;
  if (opts.bearer) headers['authorization'] = `Bearer ${opts.bearer}`;
  return new NextRequest(url, {
    method: opts.method ?? 'POST',
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}
