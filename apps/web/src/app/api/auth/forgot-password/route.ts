import { ForgotPasswordRequestSchema } from '@gabee/types';
import { route, readJson, json } from '@/lib/server/http';
import { rateLimit, clientIpFrom } from '@/lib/server/rate-limit';
import { getPublicAppUrl } from '@/lib/server/public-url';
import { requestPasswordReset } from '@/lib/server/services/password-reset';
import { logAuthEvent } from '@/lib/server/services/auth-events';

export const runtime = 'nodejs';

/**
 * POST /api/auth/forgot-password
 *
 * Kicks off a password reset by sending a token-bearing email to the
 * registered address. Returns 200 unconditionally so the endpoint can't be
 * abused to enumerate which emails exist in the system — the response is
 * indistinguishable for known vs. unknown emails.
 *
 * Rate-limited at 3 / 10 min / IP because each call writes a row + sends an
 * email; the limit is tighter than signup/login to keep abuse from melting
 * the email provider quota.
 */
export const POST = route(async (req) => {
  rateLimit(clientIpFrom(req), {
    scope: 'forgot-password',
    limit: 3,
    windowMs: 10 * 60_000,
  });

  const input = await readJson(req, ForgotPasswordRequestSchema);
  // Public-facing origin used to mint the link in the reset email — see
  // public-url.ts for the resolution order (PARENT_APP_URL > forwarded
  // headers > req.url). In prod, set PARENT_APP_URL so the link always
  // reads as the public hostname regardless of reverse-proxy quirks.
  const appUrl = getPublicAppUrl(req);
  // Best-effort — log but don't expose errors to the caller (no enumeration).
  try {
    await requestPasswordReset(input.email, appUrl);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[auth:forgot-password]', e);
  }
  // Audit log: we DO log the request even when no account matches — probing
  // many emails is itself suspicious. parentId stays null for misses.
  void logAuthEvent({
    req,
    kind: 'forgot_password_requested',
    detail: { email_domain: input.email.split('@')[1] ?? 'unknown' },
  });
  return json({ ok: true });
});
