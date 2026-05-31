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
export const SESSION_COOKIE = 'gabee_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
