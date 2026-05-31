/**
 * Outbound email — minimal abstraction over the underlying provider so the
 * rest of the app sees a single `sendEmail()` call. Selected at boot via
 * `EMAIL_PROVIDER`, or auto-detected from the available credentials:
 *
 *   - `noop` (fallback): logs the message to stdout, returns ok. Use in dev /
 *     CI / first-time deploys so the absence of credentials never blocks the
 *     feature.
 *   - `mailgun`: POST to https://api.mailgun.net/v3/{domain}/messages. Requires
 *     `MAILGUN_API_KEY` + `MAILGUN_DOMAIN`. From-address defaults to
 *     `MAILGUN_FROM` (matches the `.env.example` layout).
 *   - `resend`: POST to https://api.resend.com/emails. Requires
 *     `RESEND_API_KEY`. Free tier is 100 emails/day, no card needed.
 *
 * Add new providers by switching on `EMAIL_PROVIDER` and exporting a
 * matching `send()` impl below — no callsite changes required.
 */

export interface EmailMessage {
  to: string | string[];
  subject: string;
  /** Plain-text body. Most providers render this when `html` is absent. */
  text: string;
  /** Optional HTML body. Provider falls back to `text` for clients that don't render HTML. */
  html?: string;
  /** Optional Reply-To — useful when the receiver should hit "Reply" and reach a USER, not the from-address. */
  replyTo?: string;
}

export interface EmailSendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

const FROM =
  process.env.EMAIL_FROM ||
  process.env.MAILGUN_FROM ||
  'Gabee <noreply@gabee.app>';

export async function sendEmail(msg: EmailMessage): Promise<EmailSendResult> {
  // Auto-detect when EMAIL_PROVIDER isn't set: Mailgun if its env vars are
  // present, Resend if its API key is, else noop. Keeps the dev DX cheap —
  // dropping MAILGUN_* in .env.local is enough to wire everything.
  const explicit = process.env.EMAIL_PROVIDER?.toLowerCase();
  const provider =
    explicit ??
    (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN
      ? 'mailgun'
      : process.env.RESEND_API_KEY
        ? 'resend'
        : 'noop');
  switch (provider) {
    case 'mailgun':
      return sendViaMailgun(msg);
    case 'resend':
      return sendViaResend(msg);
    case 'noop':
    default:
      return sendViaNoop(msg);
  }
}

async function sendViaNoop(msg: EmailMessage): Promise<EmailSendResult> {
  // eslint-disable-next-line no-console
  console.log(
    `[email:noop] to=${JSON.stringify(msg.to)} subject=${JSON.stringify(msg.subject)} bytes=${msg.text.length + (msg.html?.length ?? 0)}`,
  );
  return { ok: true };
}

async function sendViaMailgun(msg: EmailMessage): Promise<EmailSendResult> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  if (!apiKey || !domain) {
    // eslint-disable-next-line no-console
    console.warn('[email:mailgun] missing MAILGUN_API_KEY / MAILGUN_DOMAIN — message not sent');
    return { ok: false, error: 'missing_credentials' };
  }
  // Mailgun's REST API takes application/x-www-form-urlencoded. Multiple `to`
  // addresses are sent as repeated `to=` keys, which URLSearchParams handles.
  const form = new URLSearchParams();
  form.set('from', FROM);
  const recipients = Array.isArray(msg.to) ? msg.to : [msg.to];
  for (const r of recipients) form.append('to', r);
  form.set('subject', msg.subject);
  form.set('text', msg.text);
  if (msg.html) form.set('html', msg.html);
  if (msg.replyTo) form.set('h:Reply-To', msg.replyTo);
  // Mailgun supports a region prefix — default to the US endpoint to match the
  // most common .env layout. Users on the EU region can set MAILGUN_REGION=eu.
  const region = process.env.MAILGUN_REGION?.toLowerCase() === 'eu' ? 'api.eu' : 'api';
  const url = `https://${region}.mailgun.net/v3/${encodeURIComponent(domain)}/messages`;
  // Basic auth: username `api`, password = the API key. Encoded as base64.
  const auth = `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[email:mailgun] ${res.status} ${errText}`);
      return { ok: false, error: `mailgun_${res.status}` };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, providerId: data?.id };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[email:mailgun]', e);
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

async function sendViaResend(msg: EmailMessage): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[email:resend] RESEND_API_KEY missing — message not sent');
    return { ok: false, error: 'missing_api_key' };
  }
  const body = {
    from: FROM,
    to: Array.isArray(msg.to) ? msg.to : [msg.to],
    subject: msg.subject,
    text: msg.text,
    ...(msg.html ? { html: msg.html } : {}),
    ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
  };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[email:resend] ${res.status} ${errText}`);
      return { ok: false, error: `resend_${res.status}` };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, providerId: data?.id };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[email:resend]', e);
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}
