import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { SignupRequestSchema } from '@gabee/types';
import { route, readJson, json, HttpError } from '@/lib/server/http';
import { signup } from '@/lib/server/services/accounts';
import { rateLimit, clientIpFrom } from '@/lib/server/rate-limit';
import { isDisposableEmail } from '@/lib/server/disposable-emails';
import { getPublicAppUrl } from '@/lib/server/public-url';
import { sendConfirmationEmail } from '@/lib/server/services/email-confirmation';
import { logAuthEvent } from '@/lib/server/services/auth-events';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  // 5 signups per 15 min per IP. Stricter than login because a fresh account
  // is a fresh attack surface — credential stuffing tools enumerate by
  // creating throwaway accounts to phish through.
  rateLimit(clientIpFrom(req), {
    scope: 'signup',
    limit: 5,
    windowMs: 15 * 60_000,
  });

  const input = await readJson(req, SignupRequestSchema);

  if (isDisposableEmail(input.email)) {
    // Generic message — don't reveal the blocklist by saying "disposable
    // email detected" (would help attackers iterate). Legitimate users won't
    // trip this; the visible cause is "invalid email".
    throw new HttpError(400, 'invalid_email', 'This email address is not accepted.');
  }

  // Optional phone: re-validate server-side via libphonenumber-js (the client
  // ran the same check, but server is the trust boundary). Already in E.164
  // by the time it reaches here (the Zod schema enforces the shape) — we
  // confirm the number is a valid combination of country + national format.
  if (input.phone) {
    const parsed = parsePhoneNumberFromString(input.phone);
    if (!parsed || !parsed.isValid()) {
      throw new HttpError(400, 'invalid_phone', 'Phone number is not valid.');
    }
  }

  const parent = await signup(input.email, input.password, { phone: input.phone ?? null });
  // No session is issued at signup: the account must confirm its email first
  // (login is gated on `emailConfirmedAt`). The client shows a "check your
  // inbox" screen on this 201.
  const res = json({ status: 'confirmation_required', email: parent.email }, 201);

  // Fire-and-forget: email confirmation + audit trail. Neither blocks the
  // 201 — the account exists either way. See public-url.ts for the
  // resolution chain; in prod set PARENT_APP_URL to override.
  const appUrl = getPublicAppUrl(req);
  void sendConfirmationEmail(parent.id, parent.email, appUrl).then(
    () => logAuthEvent({ req, kind: 'email_confirmation_sent', parentId: parent.id }),
    (e) => {
      // eslint-disable-next-line no-console
      console.error('[auth:signup] confirmation email failed', e);
    },
  );
  void logAuthEvent({
    req,
    kind: 'signup',
    parentId: parent.id,
    detail: { has_phone: !!input.phone },
  });
  return res;
});
