import { LoginRequestSchema, type AuthSessionResponse } from '@gabee/types';
import { route, readJson, json } from '@/lib/server/http';
import { createSessionToken, setSessionCookie } from '@/lib/server/auth';
import { login } from '@/lib/server/services/accounts';
import { clientIpFrom, rateLimit } from '@/lib/server/rate-limit';
import { logAuthEvent } from '@/lib/server/services/auth-events';
import { HttpError } from '@/lib/server/http';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  // Throttle brute-force login attempts: 5 per 5 minutes per source IP. We bucket
  // BEFORE parsing the body so a flood of invalid JSON can't slip past the gate.
  rateLimit(clientIpFrom(req), { scope: 'auth.login', limit: 5, windowMs: 5 * 60_000 });

  const input = await readJson(req, LoginRequestSchema);
  try {
    const parent = await login(input.email, input.password);
    const { token, expiresAt } = await createSessionToken({ parentId: parent.id, email: parent.email });
    const body: AuthSessionResponse = { token, expires_at: expiresAt.toISOString(), parent };
    const res = json(body);
    setSessionCookie(res, token);
    void logAuthEvent({ req, kind: 'login_success', parentId: parent.id });
    return res;
  } catch (e) {
    // Log the failure regardless of cause (unknown email, bad password). We
    // don't include the full email in `detail` to avoid PII in audit, just a
    // shape signal — admins can correlate by IP/timing if they need more.
    void logAuthEvent({
      req,
      kind: 'login_failure',
      detail: { email_domain: input.email.split('@')[1] ?? 'unknown' },
    });
    if (e instanceof HttpError) throw e;
    throw e;
  }
});
