import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
import { getSession, type SessionClaims } from './auth';
import { prisma } from './db';

/** An error with an HTTP status + machine code; serialized to the ApiError shape. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorResponse(err: HttpError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    },
    { status: err.status },
  );
}

/** Parse + validate a JSON body against a Zod schema (the boundary discipline). */
export async function readJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(422, 'validation_error', 'Request failed validation', result.error.issues);
  }
  return result.data;
}

/**
 * Require an authenticated parent session (cookie or bearer); 401 otherwise. Also
 * 401s when the JWT is signature-valid but its parentId no longer maps to an account
 * (deleted, or the dev DB was reset and the client still holds an old token) — so the
 * kid PWA can clear its stored token and bounce to Login instead of sitting on an
 * empty profile list.
 */
export async function requireParent(req: NextRequest): Promise<SessionClaims> {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'unauthorized', 'Authentication required');
  const exists = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { id: true },
  });
  if (!exists) throw new HttpError(401, 'session_stale', 'Session is no longer valid');
  return session;
}

/**
 * Require an authenticated admin or super_admin session (admin spec §2). 401 if
 * unauthenticated, 403 otherwise. The role is read from the DB (not the JWT) so a
 * role change takes effect without re-issuing tokens.
 */
export async function requireAdmin(req: NextRequest): Promise<SessionClaims> {
  const session = await requireParent(req);
  const account = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { role: true },
  });
  if (account?.role !== 'admin' && account?.role !== 'super_admin') {
    throw new HttpError(403, 'forbidden', 'Admin access required');
  }
  return session;
}

/** Require a super_admin session (admin spec §2 — module edits, role changes, invites). */
export async function requireSuperAdmin(req: NextRequest): Promise<SessionClaims> {
  const session = await requireParent(req);
  const account = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { role: true },
  });
  if (account?.role !== 'super_admin') {
    throw new HttpError(403, 'forbidden', 'Super-admin access required');
  }
  return session;
}

type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<NextResponse> | NextResponse;

/** Wrap a route handler so thrown HttpErrors become ApiError responses. */
export function route<Ctx = unknown>(fn: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err);
      console.error('[api] unhandled error', err);
      return errorResponse(new HttpError(500, 'internal_error', 'Something went wrong'));
    }
  };
}
