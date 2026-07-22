// Server-only environment configuration. Never import from client components.
//
// All required env vars are validated at MODULE LOAD via Zod. A missing or invalid
// var throws synchronously the first time this file is imported — which on the server
// happens during boot (db.ts, auth.ts both import it), so a misconfigured deploy
// fails loudly instead of silently degrading.

import { z } from 'zod';

const IS_PROD_RAW = process.env.NODE_ENV === 'production';

/** Dev fallback for AUTH_JWT_SECRET — only used when NODE_ENV !== 'production'. */
const DEV_JWT_SECRET = 'dev-insecure-secret-change-me-dev-insecure-secret-change-me';

// Note: NEXT_PUBLIC_KID_APP_URL is referenced in a couple of places (admin nav,
// devices service) with localhost fallbacks; we validate format here but keep the
// fallback semantics by making it optional with a default.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database — Prisma's pooled URL (required); DIRECT_URL only needed for migrations.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1).optional(),

  // Session JWT secret. ≥32 chars protects against brute-force on HS256.
  // Always optional at the schema level so dev gets a sane fallback; the prod
  // requirement is enforced separately after parse.
  AUTH_JWT_SECRET: z
    .string()
    .min(32, 'AUTH_JWT_SECRET must be at least 32 characters')
    .optional(),

  // Cross-origin kid PWA. CORS allowlist + share links in admin nav.
  KID_APP_ORIGIN: z.url().default('http://localhost:5173'),
  NEXT_PUBLIC_KID_APP_URL: z.url().default('http://localhost:5173'),

  // Public parent app URL — used to mint absolute links in outbound emails
  // (password reset, email confirmation, co-parent invite). Optional: when
  // unset we fall back to forwarded-header detection, then req.url; setting
  // it explicitly is the safest choice in prod where the request looks like
  // localhost to Next.js (behind Traefik / a reverse proxy).
  PARENT_APP_URL: z.url().optional(),

  // Cookie `Domain` scopes for the two session cookies. The parent cookie
  // is shared across parents.gabee.app + kids.gabee.app (and the apex
  // landing) via a leading-dot domain. The admin cookie is intentionally
  // scoped to admin.gabee.app ONLY so an admin login never silently
  // authenticates a parent surface. Leave unset in dev: each cookie then
  // gets no Domain attribute and is scoped to the exact host (localhost),
  // which is what we want for path-based local routing.
  // Prod (example):
  //   COOKIE_DOMAIN_PARENT=.gabee.app
  //   COOKIE_DOMAIN_ADMIN=admin.gabee.app
  COOKIE_DOMAIN_PARENT: z.string().optional(),
  COOKIE_DOMAIN_ADMIN: z.string().optional(),

  // Shared secret for cron endpoints — the cron-digest sidecar passes it
  // via `Authorization: Bearer <secret>` and the route gates on it. When
  // unset, the cron endpoints refuse every request (fail-closed). Generate
  // with `openssl rand -hex 32`.
  CRON_SECRET: z.string().min(32).optional(),

  // ── Weekly admin digest (ops report) ──────────────────────────────────────
  // Recipient(s) for the weekly platform digest — comma-separated. Defaults to
  // the founder's address when unset (single-operator phase).
  ADMIN_DIGEST_TO: z.string().optional(),
  // Base URL of the admin app, used to build deep links in the digest email
  // (e.g. <ADMIN_APP_URL>/admin/content). Defaults to https://admin.gabee.app.
  ADMIN_APP_URL: z.url().optional(),
  // UTC weekday the digest goes out (0=Sun … 6=Sat). Defaults to Sunday (0).
  // The cron sidecar pokes daily; the endpoint only sends on this day.
  ADMIN_DIGEST_DOW: z.coerce.number().int().min(0).max(6).optional(),

  // ── Observability (Sentry) ────────────────────────────────────────────────
  // All optional — with none set, Sentry initialises to a no-op (see
  // sentry.*.config.ts). SENTRY_DSN = server-side error reporting;
  // NEXT_PUBLIC_SENTRY_DSN = browser (inlined into the client bundle).
  // SENTRY_AUTH_TOKEN/ORG/PROJECT are BUILD-time only (source-map upload) and
  // are read directly in next.config.ts, not validated here.
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  // Read-only API access for the admin "System logs" page (pulls recent issues
  // via Sentry's REST API). SENTRY_ORG/PROJECT are shared with the build-time
  // source-map config. SENTRY_API_TOKEN needs project:read + event:read scope.
  // SENTRY_API_BASE overrides the host for region orgs (e.g. https://us.sentry.io).
  SENTRY_API_TOKEN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  // Comma-separated project slugs the logs page queries (e.g.
  // "gabee-web,gabee-kid"). Falls back to SENTRY_PROJECT when unset. Kept
  // separate so the single-project build source-map config isn't affected.
  SENTRY_LOG_PROJECTS: z.string().optional(),
  SENTRY_API_BASE: z.string().optional(),
});

type RawEnv = z.infer<typeof envSchema>;
type Env = Omit<RawEnv, 'AUTH_JWT_SECRET'> & { AUTH_JWT_SECRET: string };

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Flatten zod issues into a single readable error so the boot log makes the
    // misconfiguration obvious (no scrolling through a JSON dump in prod logs).
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${issues}\n` +
        `(see apps/web/src/lib/server/env.ts for the expected schema)`,
    );
  }
  const data = parsed.data;
  if (!data.AUTH_JWT_SECRET) {
    if (IS_PROD_RAW) {
      throw new Error(
        'Invalid environment configuration:\n  - AUTH_JWT_SECRET must be set in production',
      );
    }
    return { ...data, AUTH_JWT_SECRET: DEV_JWT_SECRET };
  }
  return { ...data, AUTH_JWT_SECRET: data.AUTH_JWT_SECRET };
}

/** Typed, validated env. Throws at import time if anything is missing/invalid. */
export const env = loadEnv();

// ─── Back-compat re-exports ──────────────────────────────────────────────────
// The codebase imports these names directly; keep them stable so this hardening
// pass doesn't require touching every call site.

export const IS_PROD = env.NODE_ENV === 'production';
export const AUTH_JWT_SECRET = env.AUTH_JWT_SECRET;
export const KID_APP_ORIGIN = env.KID_APP_ORIGIN;
export const PARENT_APP_URL = env.PARENT_APP_URL;
export const CRON_SECRET = env.CRON_SECRET;
export const ADMIN_DIGEST_TO = env.ADMIN_DIGEST_TO || 'nguemnev@gmail.com';
export const ADMIN_APP_URL = env.ADMIN_APP_URL || 'https://admin.gabee.app';
export const ADMIN_DIGEST_DOW = env.ADMIN_DIGEST_DOW ?? 0;
/**
 * Two distinct cookie names so an admin session and a parent session can
 * coexist in the same browser without one accidentally authenticating the
 * other's surface. Combined with `COOKIE_DOMAIN_*` scoping, the parent
 * cookie reaches parents + kids + apex; the admin cookie reaches admin
 * only.
 */
export const PARENT_SESSION_COOKIE = 'gabee_parent_session';
export const ADMIN_SESSION_COOKIE = 'gabee_admin_session';
/** Legacy single-cookie name — only kept around for the brief migration
 *  window where existing users still hold it. Reads fall through to this if
 *  neither new cookie is present. */
export const LEGACY_SESSION_COOKIE = 'gabee_session';
export const COOKIE_DOMAIN_PARENT = env.COOKIE_DOMAIN_PARENT;
export const COOKIE_DOMAIN_ADMIN = env.COOKIE_DOMAIN_ADMIN;
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
