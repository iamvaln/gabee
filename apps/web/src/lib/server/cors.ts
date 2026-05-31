import { KID_APP_ORIGIN } from './env';

/**
 * CORS headers for the cross-origin kid PWA. The kid app authenticates with a bearer
 * JWT (not cookies), so we don't enable credentials. Only the kid origin is allowed.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin === KID_APP_ORIGIN ? origin : KID_APP_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
