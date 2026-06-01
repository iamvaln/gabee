import { z } from 'zod';
import { route, readJson, json } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { rateLimit, clientIpFrom } from '@/lib/server/rate-limit';
import { getPublicAppUrl } from '@/lib/server/public-url';
import { sendConfirmationEmail } from '@/lib/server/services/email-confirmation';
import { logAuthEvent } from '@/lib/server/services/auth-events';

export const runtime = 'nodejs';

const ResendSchema = z.object({ email: z.string().email() });

/**
 * POST /api/auth/resend-confirmation — re-send the email-confirmation link for
 * an unconfirmed account. ALWAYS returns 200 (no account enumeration): the
 * response is identical whether the email exists, is already confirmed, or not.
 * Rate-limited per IP. The email send is fire-and-forget so timing doesn't leak
 * account existence either.
 */
export const POST = route(async (req) => {
  rateLimit(clientIpFrom(req), { scope: 'auth.resend-confirmation', limit: 3, windowMs: 10 * 60_000 });

  const { email } = await readJson(req, ResendSchema);
  const normalized = email.trim().toLowerCase();
  const account = await prisma.parentAccount.findUnique({
    where: { email: normalized },
    select: { id: true, email: true, emailConfirmedAt: true },
  });

  if (account && !account.emailConfirmedAt) {
    const appUrl = getPublicAppUrl(req);
    void sendConfirmationEmail(account.id, account.email, appUrl).then(
      () => logAuthEvent({ req, kind: 'email_confirmation_sent', parentId: account.id }),
      (e) => {
        // eslint-disable-next-line no-console
        console.error('[auth:resend-confirmation] email failed', e);
      },
    );
  }

  return json({ ok: true });
});
