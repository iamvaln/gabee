import type { NextRequest, NextResponse } from 'next/server';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { prisma } from '../db';
import { HttpError, requireAdmin, requireSuperAdmin, route } from '../http';
import { reportError } from '../report-error';
import { AiInvalidOutputError, AiRefusedError, AiUnavailableError } from '../ai/router';
import type { Actor } from './state';

/**
 * The Communication admin API's shared route kit: the error mapping every
 * studio route uses (`toHttpError`, wired by `studioRoute`), the acting
 * admin (`adminActor` / `superAdminActor`) and the id path parameter.
 *
 * Sentry (Ruling 7): the router already reported an unavailable AI (chain
 * exhausted), so it is only mapped here. A refusal or an invalid output is
 * recorded on its AgentRun but reported by no one upstream: it is reported
 * here, once, as the request ends. A storage failure is reported here too.
 * Anything unmapped is rethrown to `route()`'s 500 path.
 */

const AI_REFUSED =
  "L'IA a refusé de traiter cette demande. Reformulez votre précision (ou choisissez une autre direction) puis réessayez.";
const AI_INVALID =
  "L'IA a répondu avec un résultat inutilisable, même après une nouvelle tentative. Réessayez dans un instant ; si cela se répète, consultez le Journal.";
const AI_UNAVAILABLE =
  "Le service d'IA est indisponible pour le moment. Rien n'a été perdu : réessayez dans quelques minutes.";
const STORAGE_UNAVAILABLE =
  "Le stockage des médias ne répond pas ou n'est pas configuré. Réessayez dans quelques minutes ; si cela se répète, prévenez l'équipe technique.";

/**
 * The API error for `err`: existing `HttpError`s pass through (the storage
 * one gets its French message), AI and storage failures get their code;
 * anything else is returned unchanged for the 500 path.
 */
export function toHttpError(err: unknown, context: Record<string, unknown> = {}): unknown {
  if (err instanceof HttpError) {
    if (err.code === 'storage_unavailable') return new HttpError(503, 'storage_unavailable', STORAGE_UNAVAILABLE);
    return err;
  }
  if (err instanceof AiRefusedError) {
    reportError(err, { scope: 'content.api', ...context });
    return new HttpError(422, 'ai_refused', AI_REFUSED, { category: err.category });
  }
  if (err instanceof AiInvalidOutputError) {
    reportError(err, { scope: 'content.api', ...context });
    return new HttpError(422, 'ai_invalid_output', AI_INVALID);
  }
  if (err instanceof AiUnavailableError) return new HttpError(503, 'ai_unavailable', AI_UNAVAILABLE);
  if (err instanceof S3ServiceException) {
    reportError(err, { scope: 'content.api', ...context });
    return new HttpError(503, 'storage_unavailable', STORAGE_UNAVAILABLE);
  }
  return err;
}

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<NextResponse>;

/** `route()` with the studio error mapping applied to whatever the handler throws. */
export function studioRoute<Ctx = unknown>(fn: Handler<Ctx>) {
  return route<Ctx>(async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      throw toHttpError(err, { method: req.method, path: req.nextUrl.pathname });
    }
  });
}

/** `requireAdmin`, plus the role (read from the DB, like the guard) for the audit row. */
export async function adminActor(req: NextRequest): Promise<Actor> {
  const session = await requireAdmin(req);
  const account = await prisma.parentAccount.findUnique({ where: { id: session.parentId }, select: { role: true } });
  return { id: session.parentId, role: account?.role ?? 'admin' };
}

export async function superAdminActor(req: NextRequest): Promise<Actor> {
  const session = await requireSuperAdmin(req);
  return { id: session.parentId, role: 'super_admin' };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `[id]` path parameter; 404 when it cannot be a row id (instead of a database 500). */
export async function idParam(ctx: { params: Promise<{ id: string }> }): Promise<string> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) throw new HttpError(404, 'not_found', "Cet élément n'existe pas (ou plus). Rechargez la page.");
  return id;
}
