import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../db';
import { HttpError } from '../http';
import { sendEmail } from '../email';

/**
 * Email confirmation (parent spec §12.2). At signup we create a one-shot
 * token, store sha256(token) in `email_confirmations`, and email the raw
 * token in a link. Clicking the link consumes the token and stamps
 * `ParentAccount.emailConfirmedAt`. Same cryptographic shape as
 * password-reset.ts (token in email, hash in DB, 7-day expiry).
 *
 * Resend: a new request for an already-existing-but-unconfirmed account
 * mints a new token; old ones expire harmlessly. We don't expose the resend
 * endpoint yet (Phase 1) but the shape is here for when we do.
 */

const CONFIRMATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function sendConfirmationEmail(
  parentId: string,
  email: string,
  appUrl: string,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  await prisma.emailConfirmation.create({
    data: {
      parentId,
      tokenHash,
      expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
    },
  });

  const link = `${appUrl}/parent/confirm-email?token=${encodeURIComponent(token)}`;
  const text = [
    `Welcome to Gabee!`,
    '',
    `Please confirm your email address by opening the link below:`,
    '',
    link,
    '',
    `The link expires in 7 days. If you didn't create a Gabee account, you can ignore this email.`,
    '',
    `— Gabee`,
  ].join('\n');

  await sendEmail({
    to: email,
    subject: 'Confirm your Gabee email',
    text,
  });
}

/**
 * Consume the token: validate + flip `emailConfirmedAt`. Single updateMany
 * for the consume step guarantees idempotency under concurrent clicks (the
 * second update touches 0 rows).
 */
export async function consumeEmailConfirmation(token: string): Promise<{ parentId: string }> {
  const tokenHash = hash(token);
  const row = await prisma.emailConfirmation.findUnique({
    where: { tokenHash },
    select: { id: true, parentId: true, expiresAt: true, consumedAt: true },
  });
  if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, 'invalid_or_expired_token', 'Confirmation link is invalid or expired.');
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.emailConfirmation.updateMany({
      where: { id: row.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new HttpError(409, 'token_already_consumed', 'Confirmation link has already been used.');
    }
    await tx.parentAccount.update({
      where: { id: row.parentId },
      data: { emailConfirmedAt: now },
    });
  });

  return { parentId: row.parentId };
}
