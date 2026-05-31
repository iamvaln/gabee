import { z } from 'zod';
import { route, readJson, json } from '@/lib/server/http';
import { rateLimit, clientIpFrom } from '@/lib/server/rate-limit';
import { consumeEmailConfirmation } from '@/lib/server/services/email-confirmation';
import { logAuthEvent } from '@/lib/server/services/auth-events';

export const runtime = 'nodejs';

const BodySchema = z.object({ token: z.string().min(20) });

/**
 * POST /api/auth/confirm-email — consumes the token from the signup email.
 * Rate-limited so a stolen token doesn't enable spam-confirmation attempts
 * (which would otherwise also reveal which tokens have been used).
 */
export const POST = route(async (req) => {
  rateLimit(clientIpFrom(req), {
    scope: 'confirm-email',
    limit: 6,
    windowMs: 10 * 60_000,
  });
  const { token } = await readJson(req, BodySchema);
  const { parentId } = await consumeEmailConfirmation(token);
  void logAuthEvent({ req, kind: 'email_confirmed', parentId });
  return json({ ok: true });
});
