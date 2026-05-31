import { LoginRequestSchema, type AuthSessionResponse } from '@gabee/types';
import { route, readJson, json } from '@/lib/server/http';
import { createSessionToken, setSessionCookie } from '@/lib/server/auth';
import { login } from '@/lib/server/services/accounts';
import { clientIpFrom, rateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  // Throttle brute-force login attempts: 5 per 5 minutes per source IP. We bucket
  // BEFORE parsing the body so a flood of invalid JSON can't slip past the gate.
  rateLimit(clientIpFrom(req), { scope: 'auth.login', limit: 5, windowMs: 5 * 60_000 });

  const input = await readJson(req, LoginRequestSchema);
  const parent = await login(input.email, input.password);
  const { token, expiresAt } = await createSessionToken({ parentId: parent.id, email: parent.email });
  const body: AuthSessionResponse = { token, expires_at: expiresAt.toISOString(), parent };
  const res = json(body);
  setSessionCookie(res, token);
  return res;
});
