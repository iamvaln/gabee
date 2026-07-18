import { RolloutRequestSchema, type FlagKey, type RolloutResult } from '@gabee/types';
import { route, json, readJson, requireSuperAdmin } from '@/lib/server/http';
import {
  setFlagOverride,
  getParentIdByEmail,
  hasOverride,
  markOverrideNotified,
} from '@/lib/server/services/feature-flags';
import { assembleRolloutEmail } from '@/lib/server/rollout-email';
import { sendEmail } from '@/lib/server/email';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const session = await requireSuperAdmin(req);
  const body = await readJson(req, RolloutRequestSchema);
  const flags = body.flags as FlagKey[];

  const assembled = assembleRolloutEmail(flags);
  const subject = body.subject ?? assembled.subject;
  const text = body.text ?? assembled.text;
  const html = body.html ?? assembled.html;
  const replyTo = process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || undefined;

  const results: RolloutResult[] = [];
  let enabled = 0,
    sent = 0,
    failed = 0;

  for (const email of body.emails) {
    const parentId = await getParentIdByEmail(email);
    if (!parentId) {
      results.push({ email, enabled: false, email_sent: false, notified_at: null, error: 'account_not_found' });
      failed++;
      continue;
    }

    let enabledHere = false;
    if (body.enable) {
      for (const key of flags) await setFlagOverride(key, { email, enabled: true });
      enabledHere = true;
      enabled++;
    }

    let emailSent = false;
    let notifiedAt: string | null = null;
    let error: string | undefined;

    if (body.send) {
      // Notification is only meaningful relative to a rollout: every flag must have an override.
      const missing =
        !body.enable && (await Promise.all(flags.map((k) => hasOverride(k, parentId)))).some((h) => !h);
      if (missing) {
        error = 'no_override_to_notify';
        failed++;
      } else {
        const r = await sendEmail({ to: email, subject, text, html, replyTo });
        if (r.ok) {
          const when = new Date();
          for (const key of flags) await markOverrideNotified(key, parentId, when);
          emailSent = true;
          notifiedAt = when.toISOString();
          sent++;
        } else {
          error = r.error ?? 'send_failed';
          failed++;
        }
      }
    }

    results.push({ email, enabled: enabledHere, email_sent: emailSent, notified_at: notifiedAt, error });
  }

  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'flag.rollout_notify',
    targetKind: 'feature_flag',
    targetId: flags.join(','),
    diff: { flags, parentCount: body.emails.length, enable: body.enable, send: body.send, sent, failed },
  });

  return json({ results, summary: { enabled, sent, failed } });
});
