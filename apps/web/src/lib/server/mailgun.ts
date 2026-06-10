// Tiny Mailgun-or-log email helper. When `MAILGUN_API_KEY` + `MAILGUN_DOMAIN`
// are set we POST to Mailgun's /messages endpoint (form-encoded). Without them
// we log to console — so dev (no mail provider wired) still works end-to-end
// for the co-parent invite flow (parent spec §9.2). The actual JWT lives in
// `accept_url`; we never embed credentials in the body.

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_FROM = process.env.MAILGUN_FROM ?? 'Gabee <no-reply@gabee.app>';
const MAILGUN_BASE = process.env.MAILGUN_BASE_URL ?? 'https://api.mailgun.net/v3';

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    // Dev fallback: log + (optionally) leak the URL embedded in the body to
    // make it easy to copy-paste through. We do NOT log the body itself to
    // avoid filling the terminal with HTML.
    console.warn(`[mailgun] would send: subject="${subject}", to="${to}"`);
    if (text) console.warn(`[mailgun] text preview: ${text.slice(0, 240)}`);
    return;
  }
  const form = new URLSearchParams();
  form.set('from', MAILGUN_FROM);
  form.set('to', to);
  form.set('subject', subject);
  form.set('html', html);
  if (text) form.set('text', text);

  const url = `${MAILGUN_BASE}/${encodeURIComponent(MAILGUN_DOMAIN)}/messages`;
  const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[mailgun] send failed: ${res.status} ${body}`);
    // Swallow — failing to send an invite email shouldn't kill the API call
    // (the inviter can re-send, and the dev response still returns the token).
  }
}

interface CoparentInviteEmail {
  invitee_email: string;
  inviter_display: string;
  kid_names: string[];
  accept_url: string;
  personal_note?: string | null;
}

/** Format the co-parent invite email (FAM2 / parent spec §9.2). Bilingual blob: simple. */
export async function sendCoparentInvite(input: CoparentInviteEmail): Promise<void> {
  const { invitee_email, inviter_display, kid_names, accept_url, personal_note } = input;
  const kidsLabel =
    kid_names.length === 0
      ? ''
      : kid_names.length === 1
        ? kid_names[0]
        : `${kid_names.slice(0, -1).join(', ')} & ${kid_names[kid_names.length - 1]}`;

  const noteBlockHtml = personal_note
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #5CC9A6;color:#333;background:#F4FBF8;border-radius:6px;">${escapeHtml(
        personal_note,
      )}</blockquote>`
    : '';
  const noteBlockText = personal_note ? `\n\n"${personal_note}"\n` : '';

  const subject = `${inviter_display} invited you to co-parent on Gabee`;
  const text = [
    `${inviter_display} invited you to co-parent ${kidsLabel || 'their kids'} on Gabee.`,
    noteBlockText,
    `Accept the invite (link valid 7 days):`,
    accept_url,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1A2E2A;padding:24px;max-width:520px;margin:0 auto;">
  <h1 style="font-size:22px;margin:0 0 12px;">You've been invited to Gabee</h1>
  <p style="font-size:15px;line-height:1.5;">
    <strong>${escapeHtml(inviter_display)}</strong> invited you to co-parent
    ${kidsLabel ? `<strong>${escapeHtml(kidsLabel)}</strong>` : 'their kids'} on Gabee.
  </p>
  ${noteBlockHtml}
  <p style="font-size:14px;line-height:1.5;color:#5B6B68;">
    You'll see the same kids and have the same rights as the inviter.
  </p>
  <p style="margin:24px 0;">
    <a href="${accept_url}" style="display:inline-block;background:#5CC9A6;color:#0E3A33;font-weight:800;text-decoration:none;padding:12px 20px;border-radius:10px;">
      Accept invite
    </a>
  </p>
  <p style="font-size:12px;color:#8A9794;">This link is valid for 7 days. If you weren't expecting this, you can ignore the email.</p>
</body></html>`;

  await sendEmail({ to: invitee_email, subject, html, text });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ─── Device pair link (parent spec §10.4 / §12.3 P9) ─────────────────────────

interface DevicePairLinkEmail {
  target_email: string;
  /** Parent display name (falls back to the email local-part at the call site). */
  parent_display: string;
  /** Friendly device label the parent picked ("Home computer", etc.). */
  label: string;
  /** The full `kids.gabee.app/?pair=…` URL. */
  pair_url: string;
  /** ISO8601 expiry of the pair token (parent spec §13 — 24h). */
  expires_at: string;
}

/**
 * Format the device-pair link email (ST3 / parent spec §10.4 + §12.3 P9). The
 * recipient walks to the device, opens the email there, and taps the link —
 * the kid PWA exchanges the one-time JWT for a long-lived (~180d) bearer.
 */
export async function sendDevicePairLink(input: DevicePairLinkEmail): Promise<void> {
  const { target_email, parent_display, label, pair_url, expires_at } = input;
  const subject = `Open Gabee on this device — ${label}`;
  const text = [
    `${parent_display} wants to set up Gabee on this device (${label}).`,
    ``,
    `Open this one-time link ON THE DEVICE you want to pair:`,
    pair_url,
    ``,
    `Once paired, the kid app stays signed in for about 6 months so kids can just play.`,
    `This link expires ${expires_at}. You can revoke this device any time from Settings → Devices.`,
  ].join('\n');

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1A2E2A;padding:24px;max-width:520px;margin:0 auto;">
  <h1 style="font-size:22px;margin:0 0 12px;">Open Gabee on this device</h1>
  <p style="font-size:15px;line-height:1.5;">
    <strong>${escapeHtml(parent_display)}</strong> wants to set up Gabee on
    <strong>${escapeHtml(label)}</strong>.
  </p>
  <p style="font-size:14px;line-height:1.5;color:#5B6B68;">
    Open this one-time link on the device you want to pair.
  </p>
  <p style="margin:24px 0;">
    <a href="${pair_url}" style="display:inline-block;background:#5CC9A6;color:#0E3A33;font-weight:800;text-decoration:none;padding:12px 20px;border-radius:10px;">
      Pair this device
    </a>
  </p>
  <p style="font-size:12px;color:#8A9794;">
    Once paired, the kid app stays signed in for about 6 months so kids can just play.
    This link expires ${escapeHtml(expires_at)}. You can revoke this device any time
    from Settings → Devices on parents.gabee.app.
  </p>
</body></html>`;

  await sendEmail({ to: target_email, subject, html, text });
}

interface ClassificationDigestEmail {
  to: string;
  parent_display: string;
  pending_count: number;
  cadence: 'daily' | 'every_2_days' | 'weekly' | 'off';
  classify_url: string;
}

/**
 * Recurring digest mail nudging a parent to classify any of their kids'
 * sessions that haven't been labelled yet (product §13.2 + parent spec §4.3).
 * The cadence is picked by the parent in Notifications settings; the cron
 * sidecar fires this once a day and the service skips parents whose cadence
 * isn't yet due since their last successful send.
 */
export async function sendClassificationDigest(input: ClassificationDigestEmail): Promise<void> {
  const { to, parent_display, pending_count, classify_url } = input;
  const sessionWord = pending_count === 1 ? 'session' : 'sessions';
  const subject = `${pending_count} ${sessionWord} to classify · Gabee`;

  const text = [
    `Hi ${parent_display},`,
    ``,
    `${pending_count} ${sessionWord} from your kids ${pending_count === 1 ? 'is' : 'are'} waiting for your classification.`,
    `Open Gabee to label them — it takes a few taps and powers the family feed.`,
    ``,
    classify_url,
    ``,
    `You can change the cadence (daily / every 2 days / weekly / off) from Settings → Notifications.`,
  ].join('\n');

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1A2E2A;padding:24px;max-width:520px;margin:0 auto;">
  <h1 style="font-size:22px;margin:0 0 12px;">${pending_count} ${escapeHtml(sessionWord)} to classify</h1>
  <p style="font-size:15px;line-height:1.5;">
    Hi <strong>${escapeHtml(parent_display)}</strong> — ${pending_count} ${escapeHtml(sessionWord)} from your kids ${pending_count === 1 ? 'is' : 'are'}
    waiting for a quick classification.
  </p>
  <p style="margin:24px 0;">
    <a href="${classify_url}" style="display:inline-block;background:#5CC9A6;color:#0E3A33;font-weight:800;text-decoration:none;padding:12px 20px;border-radius:10px;">
      Classify ${pending_count === 1 ? 'it' : 'them'} now
    </a>
  </p>
  <p style="font-size:12px;color:#8A9794;">
    You can change the cadence (daily / every 2 days / weekly / off) from
    Settings → Notifications on parents.gabee.app.
  </p>
</body></html>`;

  await sendEmail({ to, subject, html, text });
}
