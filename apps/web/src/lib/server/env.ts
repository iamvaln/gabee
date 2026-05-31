// Server-only configuration. Never import from client components.

export const IS_PROD = process.env.NODE_ENV === 'production';

/** Secret for signing session JWTs (HS256). MUST be set in production. */
export const AUTH_JWT_SECRET = (() => {
  const s = process.env.AUTH_JWT_SECRET;
  if (s) return s;
  if (IS_PROD) throw new Error('AUTH_JWT_SECRET must be set in production');
  return 'dev-insecure-secret-change-me';
})();

export const SESSION_COOKIE = 'gabee_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Cross-origin kid PWA origin allowed to call the API (CORS + bearer JWT). */
export const KID_APP_ORIGIN = process.env.KID_APP_ORIGIN ?? 'http://localhost:5173';
