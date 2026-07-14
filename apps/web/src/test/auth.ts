/**
 * Layer-3 (route handler) test helper: mint a real session JWT and build a
 * NextRequest carrying it as the httpOnly parent session cookie. Later
 * route-level integration tests should copy this pattern rather than
 * hand-rolling cookie headers.
 */
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/server/auth';
import { PARENT_SESSION_COOKIE } from '@/lib/server/env';

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
