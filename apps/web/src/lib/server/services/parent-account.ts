// Parent account services for the Settings surface (parent spec §10).
//
// These functions back the routes under /api/account/*. They keep the
// validation + DB orthogonality discipline: route handlers parse JSON via
// Zod, then call into here for the actual mutations.
import { prisma } from '../db';
import { HttpError } from '../http';
import { hashPassword, verifyPassword } from '../auth';

export interface ParentAccountSummary {
  id: string;
  email: string;
  role: 'parent' | 'admin' | 'super_admin';
  displayNameForKids: string;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Read the fields the Settings page needs (raw, not the DTO — it lacks display_name). */
export async function getAccountSummary(parentId: string): Promise<ParentAccountSummary> {
  const row = await prisma.parentAccount.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      email: true,
      role: true,
      displayNameForKids: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });
  if (!row) throw new HttpError(404, 'account_not_found', 'Account not found');
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    displayNameForKids: row.displayNameForKids,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
  };
}

/**
 * Update profile fields (Phase 1: display name only). first_name / last_name /
 * country / ui_language are surfaced by the UI but not persisted — the DB
 * columns are pending Phase 2.x.
 */
export async function updateProfile(
  parentId: string,
  input: { display_name_for_kids: string },
): Promise<ParentAccountSummary> {
  await prisma.parentAccount.update({
    where: { id: parentId },
    data: { displayNameForKids: input.display_name_for_kids },
  });
  return getAccountSummary(parentId);
}

/**
 * Retire the active credential and insert a fresh one (mirrors the rotation
 * pattern in `accounts.changePassword`). Phase 1 doesn't yet send a security
 * email — that wiring is Phase 2.x (parent spec §10.2).
 */
export async function changePassword(
  parentId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const credential = await prisma.parentCredential.findFirst({
    where: { parentId, retiredAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!credential) throw new HttpError(400, 'no_credential', 'No active credential to replace');

  const ok = await verifyPassword(currentPassword, credential.hash, credential.salt);
  if (!ok) throw new HttpError(401, 'invalid_credentials', 'Current password is incorrect');

  const { hash, salt } = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.parentCredential.update({
      where: { id: credential.id },
      data: { retiredAt: new Date() },
    }),
    prisma.parentCredential.create({ data: { parentId, hash, salt, algorithm: 'scrypt' } }),
  ]);
}

/**
 * Account deletion (parent spec §10.6) — creates a GDPR `erase` request in
 * the admin queue instead of hard-deleting. The actual purge is run manually
 * by an admin per the admin GDPR workflow (admin spec §9). The session
 * cookie is cleared by the route handler so the parent is signed out.
 */
export async function requestDeletion(
  parentId: string,
  emailConfirm: string,
): Promise<void> {
  const account = await prisma.parentAccount.findUnique({
    where: { id: parentId },
    select: { email: true },
  });
  if (!account) throw new HttpError(404, 'account_not_found', 'Account not found');
  if (emailConfirm.trim().toLowerCase() !== account.email.toLowerCase()) {
    throw new HttpError(400, 'email_mismatch', 'Email confirmation does not match the account email');
  }
  await prisma.gdprRequest.create({
    data: {
      kind: 'erase',
      parentId,
      email: account.email,
      notes: 'Requested via parent Settings → Account deletion',
    },
  });
}
