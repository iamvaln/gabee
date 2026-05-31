import { ContactRequestSchema } from '@gabee/types';
import { route, json, readJson } from '@/lib/server/http';
import { createContactMessage } from '@/lib/server/services/admin-frontdesk';
import { rateLimit, clientIpFrom } from '@/lib/server/rate-limit';
import { sendEmail } from '@/lib/server/email';

export const runtime = 'nodejs';

// Public landing contact form (admin spec §8). NO auth — anyone can reach the
// marketing page. Creates an InboxMessage with source `landing_contact` and
// fires a notification email to the admin recipient (configured via
// `ADMIN_CONTACT_EMAIL`) so unattended inbox checks aren't the only signal.
//
// Hardening:
//   - Rate-limited per client IP (5 submissions / 5 min) so the inbox isn't
//     spammable from a single source. The honeypot in the form covers naive
//     bots; this covers determined ones.
//   - The notification email is best-effort: a send failure doesn't 500 the
//     submission — the inbox row is the source of truth.
export const POST = route(async (req) => {
  rateLimit(clientIpFrom(req), {
    scope: 'contact',
    limit: 5,
    windowMs: 5 * 60_000,
  });

  const body = await readJson(req, ContactRequestSchema);
  const { id } = await createContactMessage(body);

  // Fire-and-forget admin notification. We intentionally do NOT await — the
  // contact form should feel instant; the email path may take 200-1500ms
  // depending on the provider.
  void notifyAdmin(body, id).catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[contact] admin notification failed', e);
  });

  return json({ id }, 201);
});

async function notifyAdmin(
  body: { name: string; email: string; subject?: string; message: string },
  inboxId: string,
): Promise<void> {
  const to = process.env.ADMIN_CONTACT_EMAIL;
  if (!to) return; // no recipient → no-op; the inbox row still exists
  const subjectLine = body.subject?.trim()
    ? `[Gabee · contact] ${body.subject}`
    : `[Gabee · contact] message from ${body.name}`;
  const text = [
    `New landing-page contact message.`,
    ``,
    `From:    ${body.name} <${body.email}>`,
    body.subject ? `Subject: ${body.subject}` : null,
    ``,
    body.message,
    ``,
    `--`,
    `Inbox id: ${inboxId}`,
    `Reply directly to this email to respond to the sender (Reply-To is set).`,
  ]
    .filter((l) => l !== null)
    .join('\n');
  await sendEmail({
    to,
    subject: subjectLine,
    text,
    replyTo: body.email,
  });
}
