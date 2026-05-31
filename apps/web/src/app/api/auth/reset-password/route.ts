import { ResetPasswordRequestSchema } from '@gabee/types';
import { route, readJson, json } from '@/lib/server/http';
import { rateLimit, clientIpFrom } from '@/lib/server/rate-limit';
import { consumePasswordReset } from '@/lib/server/services/password-reset';
import { logAuthEvent } from '@/lib/server/services/auth-events';

export const runtime = 'nodejs';

/**
 * POST /api/auth/reset-password
 *
 * Consumes a reset token and sets the new password. Returns the precise
 * 400/409 from the service so the UI can render a clear error (the token is
 * single-use; once consumed, subsequent calls return 409 not 200, which is
 * fine — the caller has already used it).
 */
export const POST = route(async (req) => {
  // Tighter than login — a brute-force on tokens is the obvious abuse path.
  // 6/10 min/IP is enough for accidental tab refreshes but not for a worm.
  rateLimit(clientIpFrom(req), {
    scope: 'reset-password',
    limit: 6,
    windowMs: 10 * 60_000,
  });

  const input = await readJson(req, ResetPasswordRequestSchema);
  const { parentId } = await consumePasswordReset(input.token, input.new_password);
  void logAuthEvent({ req, kind: 'password_reset_consumed', parentId });
  return json({ ok: true });
});
