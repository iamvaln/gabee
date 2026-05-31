import {
  type ParentsListResponse,
  type ChildrenListResponse,
  type AdminsListResponse,
  type InviteAdminRequest,
  type SetRoleRequest,
  type AccountRole,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';

// `AdminListItemSchema` exists in @gabee/types but no inferred type is exported; derive
// it from the list response (read-only; we don't redefine the contract).
type AdminListItem = AdminsListResponse['admins'][number];

/** U1 — parent accounts with child counts and login metadata. */
export async function listParents(): Promise<ParentsListResponse> {
  const rows = await prisma.parentAccount.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
      _count: { select: { children: true } },
    },
  });
  return {
    parents: rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      children_count: r._count.children,
      created_at: r.createdAt.toISOString(),
      last_login_at: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    })),
    total: rows.length,
  };
}

/** U3 — child profiles with parent email and activity. */
export async function listChildren(): Promise<ChildrenListResponse> {
  const rows = await prisma.childProfile.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      language: true,
      totalStars: true,
      lastActiveAt: true,
      parent: { select: { email: true } },
    },
  });
  return {
    children: rows.map((r) => ({
      id: r.id,
      name: r.name,
      parent_email: r.parent.email,
      language: r.language,
      total_stars: r.totalStars,
      last_active_at: r.lastActiveAt ? r.lastActiveAt.toISOString() : null,
    })),
    total: rows.length,
  };
}

/** U5 — the internal admin team (accounts with an elevated role). */
export async function listAdmins(): Promise<AdminsListResponse> {
  const rows = await prisma.parentAccount.findMany({
    where: { role: { in: ['admin', 'super_admin'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, role: true, createdAt: true, lastLoginAt: true },
  });
  return {
    admins: rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role as AdminListItem['role'],
      created_at: r.createdAt.toISOString(),
      last_login_at: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    })),
  };
}

/**
 * U6 — promote an EXISTING account by email to admin / super_admin (super_admin only;
 * caller gates). 404 if no account with that email exists. Returns the new role plus the
 * previous one so the route can write an accurate audit diff.
 */
export async function promoteAdmin(
  body: InviteAdminRequest,
): Promise<{ id: string; previousRole: AccountRole; role: AccountRole }> {
  const account = await prisma.parentAccount.findUnique({
    where: { email: body.email },
    select: { id: true, role: true },
  });
  if (!account) {
    throw new HttpError(404, 'account_not_found', `No account with email "${body.email}"`);
  }
  await prisma.parentAccount.update({ where: { id: account.id }, data: { role: body.role } });
  return { id: account.id, previousRole: account.role, role: body.role };
}

/**
 * Change or revoke an account's role (super_admin only; caller gates). Setting `parent`
 * revokes admin access. 404 if the account is missing.
 */
export async function setRole(
  id: string,
  body: SetRoleRequest,
): Promise<{ id: string; previousRole: AccountRole; role: AccountRole }> {
  const account = await prisma.parentAccount.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!account) {
    throw new HttpError(404, 'account_not_found', `No account with id "${id}"`);
  }
  await prisma.parentAccount.update({ where: { id }, data: { role: body.role } });
  return { id: account.id, previousRole: account.role, role: body.role };
}
