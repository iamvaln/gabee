import type { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { prisma } from '../db';
import { HttpError, requireAdmin, requireSuperAdmin, route } from '../http';
import { reportError } from '../report-error';
import { AiInvalidOutputError, AiRefusedError, AiUnavailableError } from '../ai/router';
import { UUID_RE, type Actor } from './state';

/**
 * The Communication admin API's shared route kit: the error mapping every
 * studio route uses (`toHttpError`, wired by `studioRoute`), the acting
 * admin (`adminActor` / `superAdminActor`) and the id path parameter.
 *
 * Sentry (Ruling 7): the router already reported an unavailable AI (chain
 * exhausted), so it is only mapped here. A refusal or an invalid output is
 * recorded on its AgentRun but reported by no one upstream: it is reported
 * here, once, as the request ends. A storage failure is reported here too
 * (unconfigured storage once per process: every media request would hit it).
 * Anything unmapped is rethrown to `route()`'s 500 path.
 */

/** Most AI routes take no free text from the owner: nothing to rephrase, so no rephrasing hint. */
const AI_REFUSED = "L'IA a refusé cette demande. Réessayez ; si cela se répète, voyez le Journal.";
/** The direction route carries the owner's own precision: that is what to rephrase. */
export const AI_REFUSED_DIRECTION =
  "L'IA a refusé de traiter cette demande. Reformulez votre précision (ou choisissez une autre direction) puis réessayez.";
const AI_INVALID =
  "L'IA a répondu avec un résultat inutilisable, même après une nouvelle tentative. Réessayez dans un instant ; si cela se répète, consultez le Journal.";
const AI_UNAVAILABLE =
  "Le service d'IA est indisponible pour le moment. Rien n'a été perdu : réessayez dans quelques minutes.";
const STORAGE_UNAVAILABLE =
  "Le stockage des médias ne répond pas ou n'est pas configuré. Réessayez dans quelques minutes ; si cela se répète, prévenez l'équipe technique.";

let storageUnavailableReported = false;

/** Test seam: forget that the missing-storage error was reported. */
export function resetStorageUnavailableReportForTests(): void {
  storageUnavailableReported = false;
}

/** Per-route copy: `refused` replaces the generic AI-refusal message (the route knows what the owner can change). */
export type StudioRouteOptions = { refused?: string };

/**
 * The API error for `err`: existing `HttpError`s pass through (the storage
 * one gets its French message), AI and storage failures get their code;
 * anything else is returned unchanged for the 500 path.
 */
export function toHttpError(err: unknown, context: Record<string, unknown> = {}, opts: StudioRouteOptions = {}): unknown {
  if (err instanceof HttpError) {
    if (err.code === 'storage_unavailable') {
      // Missing MEDIA_R2_* (or memory storage in production): a deploy problem no request can fix.
      // Report it once per process so Sentry hears of it without one event per media request.
      if (!storageUnavailableReported) {
        storageUnavailableReported = true;
        reportError(err, { scope: 'content.api', ...context });
      }
      return new HttpError(503, 'storage_unavailable', STORAGE_UNAVAILABLE);
    }
    return err;
  }
  if (err instanceof AiRefusedError) {
    reportError(err, { scope: 'content.api', ...context });
    return new HttpError(422, 'ai_refused', opts.refused ?? AI_REFUSED, { category: err.category });
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
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for studio mutations. The admin session cookie is SameSite=Lax,
 * which still lets another gabee.app subdomain ("same-site") send it, body or
 * not. Browsers set `Sec-Fetch-Site` themselves (a page cannot forge it): a
 * mutation is refused unless it is `same-origin` (the admin UI) or `none`
 * (typed by the user). Requests without the header (non-browser clients, the
 * test harness) carry no ambient cookie risk and pass.
 */
export function assertSameOrigin(req: Request): void {
  if (SAFE_METHODS.has(req.method)) return;
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new HttpError(403, 'forbidden_origin', "Cette action doit venir de l'admin Gabee. Rechargez la page depuis admin.gabee.app puis réessayez.");
  }
}

export function studioRoute<Ctx = unknown>(fn: Handler<Ctx>, opts: StudioRouteOptions = {}) {
  return route<Ctx>(async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      throw toHttpError(err, { method: req.method, path: req.nextUrl.pathname }, opts);
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

/** The `[id]` path parameter; 404 when it cannot be a row id (instead of a database 500). */
export async function idParam(ctx: { params: Promise<{ id: string }> }): Promise<string> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) throw new HttpError(404, 'not_found', "Cet élément n'existe pas (ou plus). Rechargez la page.");
  return id;
}

/**
 * An optional JSON body, read whatever the content type (a bodiless POST from
 * an older screen or a script still works): an empty body is `{}`, anything
 * else must be JSON matching `schema` (400 `invalid_json` / 422 `validation_error`).
 */
export async function readOptionalJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const text = await req.text();
  let body: unknown = {};
  if (text.trim()) {
    // A body must be declared JSON: a cross-site "simple" request (text/plain,
    // form encoded) is refused, and a JSON one needs a CORS preflight that other
    // origins fail — the session cookie (SameSite=Lax) is shared by every gabee.app subdomain.
    const type = (req.headers.get('content-type') ?? '').toLowerCase();
    if (!type.startsWith('application/json')) {
      throw new HttpError(415, 'unsupported_media_type', "La demande n'a pas pu être lue (format inattendu). Rechargez la page puis réessayez.");
    }
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, 'invalid_json', "La demande n'a pas pu être lue (JSON invalide). Rechargez la page puis réessayez.");
    }
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, 'validation_error', 'Request failed validation', parsed.error.issues);
  return parsed.data;
}
