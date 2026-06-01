import type { ParentAccount } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { hashPassword, verifyPassword } from '../auth';
import { mapParentAccount } from '../mappers';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Create a parent account + its first (active) credential. */
export async function signup(
  email: string,
  password: string,
  opts: { phone?: string | null } = {},
): Promise<ParentAccount> {
  const normalized = normalizeEmail(email);
  const existing = await prisma.parentAccount.findUnique({ where: { email: normalized } });
  if (existing) throw new HttpError(409, 'email_taken', 'An account with this email already exists');

  const { hash, salt } = await hashPassword(password);
  const account = await prisma.parentAccount.create({
    data: {
      email: normalized,
      ...(opts.phone ? { phone: opts.phone } : {}),
      credentials: { create: { hash, salt, algorithm: 'scrypt' } },
    },
    include: { children: true },
  });
  return mapParentAccount(account);
}

/** Verify credentials against the active credential row; generic error on any failure. */
export async function login(email: string, password: string): Promise<ParentAccount> {
  const normalized = normalizeEmail(email);
  const account = await prisma.parentAccount.findUnique({
    where: { email: normalized },
    include: {
      children: true,
      credentials: { where: { retiredAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  const credential = account?.credentials[0];
  if (!account || !credential) {
    throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');
  }
  const ok = await verifyPassword(password, credential.hash, credential.salt);
  if (!ok) throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');

  // Email confirmation gate: credentials are valid but the account hasn't
  // confirmed its email. Surfaced AFTER the password check so we never reveal
  // confirmation state to someone who doesn't know the password. The client
  // offers a "resend confirmation" action on this code.
  if (!account.emailConfirmedAt) {
    throw new HttpError(403, 'email_not_confirmed', 'Please confirm your email before signing in.');
  }

  await prisma.parentAccount.update({
    where: { id: account.id },
    data: { lastLoginAt: new Date() },
  });
  return mapParentAccount(account);
}

/**
 * Returns the parent's account + the children they have access to. Today that
 * includes BOTH `ChildProfile.parentId === parentId` (the primary parent's own
 * kids, back-compat) AND children linked via `ParentChildLink` (co-parents).
 * The two sets are unioned and deduplicated by child id so a primary doesn't
 * appear twice once their own ParentChildLink row exists.
 */
export async function getAccount(parentId: string): Promise<ParentAccount> {
  const account = await prisma.parentAccount.findUnique({
    where: { id: parentId },
    include: {
      children: true,
      childLinks: { include: { child: true } },
    },
  });
  if (!account) throw new HttpError(404, 'account_not_found', 'Account not found');
  // Union: own kids + linked kids, dedup by id, preserve creation order.
  const byId = new Map<string, (typeof account.children)[number]>();
  for (const c of account.children) byId.set(c.id, c);
  for (const link of account.childLinks) byId.set(link.child.id, link.child);
  const merged = Array.from(byId.values()).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return mapParentAccount({ ...account, children: merged });
}

/** Retire the current credential and insert a new active one (keeps history). */
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
