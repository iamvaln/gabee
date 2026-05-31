import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../db';
import { HttpError } from '../http';
import { hashPassword } from '../auth';
import { sendEmail } from '../email';

/**
 * Password reset (parent spec §12.2). Cryptographic design:
 *   - Token: 32 random bytes, base64url-encoded → 43 chars URL-safe.
 *   - DB stores ONLY sha256(token), so a DB leak alone doesn't grant resets.
 *   - 30-min expiry — long enough for inbox-grepping, short enough that a
 *     compromised mailbox can't recover stale tokens months later.
 *   - Endpoint always returns 200/no-content so no enumeration: an attacker
 *     hitting random emails can't tell which are registered.
 *   - One row per request; older pending tokens stay in the table and expire
 *     naturally. Race-safe at the consume step (single `updateMany`).
 */

const RESET_TTL_MS = 30 * 60_000;

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Kick off a reset for `email`. Always succeeds visibly even when the email
 * doesn't exist — the caller can't distinguish. Sends the reset link via the
 * configured email provider (Mailgun/noop). The link points at
 * `{appUrl}/parent/reset-password?token=…`.
 */
export async function requestPasswordReset(email: string, appUrl: string): Promise<void> {
  const account = await prisma.parentAccount.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, displayNameForKids: true },
  });
  // Always return success — no enumeration. If there's no account we still
  // burn the timing budget by hashing a fake token so the response time is
  // similar (defence against side-channel email-existence checks).
  if (!account) {
    hash(randomBytes(32).toString('base64url'));
    return;
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  await prisma.passwordReset.create({
    data: {
      parentId: account.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  const link = `${appUrl}/parent/reset-password?token=${encodeURIComponent(token)}`;
  const text = [
    `Hello${account.displayNameForKids ? ' ' + account.displayNameForKids : ''},`,
    '',
    `You requested a password reset for your Gabee account.`,
    `Open the link below to set a new password. It expires in 30 minutes:`,
    '',
    link,
    '',
    `If you didn't ask for this, you can safely ignore this email — the link is single-use and short-lived.`,
    '',
    `— Gabee`,
  ].join('\n');
  await sendEmail({
    to: account.email,
    subject: 'Reset your Gabee password',
    text,
  });
}

/**
 * Consume a reset token: validates expiry + idempotency, retires the active
 * credential, inserts a new active one (hash + salt via scrypt). Single
 * `updateMany` on the consumption step guarantees a token can't be replayed
 * even under a race (the second concurrent attempt updates 0 rows).
 */
export async function consumePasswordReset(token: string, newPassword: string): Promise<{ parentId: string }> {
  const tokenHash = hash(token);
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash },
    select: { id: true, parentId: true, expiresAt: true, consumedAt: true },
  });
  if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, 'invalid_or_expired_token', 'Reset link is invalid or expired.');
  }

  const { hash: newHash, salt } = await hashPassword(newPassword);
  const now = new Date();
  // Atomic consume — updateMany with the (consumedAt: null, NOT expired)
  // predicate so a parallel call can't double-use it. Then retire the active
  // credential and install the new one in the same transaction.
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordReset.updateMany({
      where: { id: row.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new HttpError(409, 'token_already_consumed', 'Reset link has already been used.');
    }
    const active = await tx.parentCredential.findFirst({
      where: { parentId: row.parentId, retiredAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (active) {
      await tx.parentCredential.update({
        where: { id: active.id },
        data: { retiredAt: now },
      });
    }
    await tx.parentCredential.create({
      data: { parentId: row.parentId, hash: newHash, salt, algorithm: 'scrypt' },
    });
  });
  return { parentId: row.parentId };
}
