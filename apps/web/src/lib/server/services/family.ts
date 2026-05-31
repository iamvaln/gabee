// Family / co-parent service (parent spec §9). All writes go through here so
// the route handlers stay thin. Phase 1 cap = 2 ParentChildLink rows per
// child, enforced in `createCoparentInvite` and `acceptCoparentInvite`.
//
// Invite token = a JWT signed with `COPARENT_INVITE_SECRET` (falls back to a
// derived suffix of AUTH_JWT_SECRET in dev). Carries `{ inviteId }` only —
// the DB row is the source of truth for status/expiry.

import { SignJWT, jwtVerify } from 'jose';
import type {
  CoparentInviteRow,
  CreateCoparentInviteRequest,
  FamilyLink,
  FamilyPanelResponse,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { AUTH_JWT_SECRET } from '../env';
import { sendCoparentInvite } from '../mailgun';

// ─── JWT secret + helpers ────────────────────────────────────────────────────

const inviteSecretRaw =
  process.env.COPARENT_INVITE_SECRET ?? `${AUTH_JWT_SECRET}:invite`;
const inviteSecret = new TextEncoder().encode(inviteSecretRaw);
const INVITE_TTL_S = 60 * 60 * 24 * 7; // 7 days

async function signInviteToken(inviteId: string): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + INVITE_TTL_S * 1000);
  const token = await new SignJWT({ inviteId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(inviteSecret);
  return { token, expiresAt };
}

async function verifyInviteToken(token: string): Promise<{ inviteId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, inviteSecret);
    if (typeof payload.inviteId !== 'string') return null;
    return { inviteId: payload.inviteId };
  } catch {
    return null;
  }
}

// ─── DTO mappers ─────────────────────────────────────────────────────────────

function mapInviteRow(inv: {
  id: string;
  inviteeEmail: string;
  childIds: string[];
  personalNote: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  expiresAt: Date;
  createdAt: Date;
}): CoparentInviteRow {
  return {
    id: inv.id,
    invitee_email: inv.inviteeEmail,
    child_ids: inv.childIds,
    personal_note: inv.personalNote,
    status: inv.status,
    expires_at: inv.expiresAt.toISOString(),
    created_at: inv.createdAt.toISOString(),
  };
}

// ─── Family panel (FAM1) ────────────────────────────────────────────────────

/**
 * Returns every parent linked to ANY of `parentId`'s children (including
 * `parentId` itself), plus the pending invites this parent has sent.
 *
 * "This parent's children" = children where `parentId` has a ParentChildLink.
 */
export async function getFamilyPanel(parentId: string): Promise<FamilyPanelResponse> {
  const myLinks = await prisma.parentChildLink.findMany({
    where: { parentId },
    select: { childId: true },
  });
  const childIds = myLinks.map((l) => l.childId);

  if (childIds.length === 0) {
    // Account with no kids yet: still show the requester as a link with no children.
    const me = await prisma.parentAccount.findUnique({
      where: { id: parentId },
      select: { id: true, email: true, displayNameForKids: true, createdAt: true },
    });
    const pending = await prisma.coparentInvite.findMany({
      where: { inviterParentId: parentId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      links: me
        ? [
            {
              parent_id: me.id,
              email: me.email,
              display_name_for_kids: me.displayNameForKids || (me.email.split('@')[0] ?? me.email),
              role: 'primary',
              joined_at: me.createdAt.toISOString(),
              children: [],
            },
          ]
        : [],
      pending_invites: pending.map(mapInviteRow),
    };
  }

  const links = await prisma.parentChildLink.findMany({
    where: { childId: { in: childIds } },
    include: {
      parent: {
        select: { id: true, email: true, displayNameForKids: true, createdAt: true },
      },
      child: { select: { id: true, name: true } },
    },
  });

  // Group by parent id. The "role" surfaced to the UI is the role of THIS
  // parent for the requester's first overlapping child — Phase 1 doesn't
  // model per-child roles in the panel; the first/primary wins.
  const byParent = new Map<
    string,
    {
      parent_id: string;
      email: string;
      display_name_for_kids: string;
      role: 'primary' | 'coparent';
      joined_at: string;
      children: { id: string; name: string }[];
    }
  >();
  for (const l of links) {
    const existing = byParent.get(l.parentId);
    if (existing) {
      existing.children.push({ id: l.child.id, name: l.child.name });
      // Prefer the earliest linkedAt as joined_at; primary wins over coparent.
      if (l.role === 'primary') existing.role = 'primary';
      if (l.linkedAt.toISOString() < existing.joined_at) {
        existing.joined_at = l.linkedAt.toISOString();
      }
    } else {
      byParent.set(l.parentId, {
        parent_id: l.parentId,
        email: l.parent.email,
        display_name_for_kids:
          l.parent.displayNameForKids || (l.parent.email.split('@')[0] ?? l.parent.email),
        role: l.role,
        joined_at: l.linkedAt.toISOString(),
        children: [{ id: l.child.id, name: l.child.name }],
      });
    }
  }

  const pending = await prisma.coparentInvite.findMany({
    where: { inviterParentId: parentId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });

  // Requester first, then by joined_at asc.
  const linksArr: FamilyLink[] = Array.from(byParent.values()).sort((a, b) => {
    if (a.parent_id === parentId) return -1;
    if (b.parent_id === parentId) return 1;
    return a.joined_at.localeCompare(b.joined_at);
  });

  return { links: linksArr, pending_invites: pending.map(mapInviteRow) };
}

// ─── Create invite (FAM2 / P3) ──────────────────────────────────────────────

/**
 * Create + email a co-parent invite. Phase 1: the invitee gets access to ALL
 * the inviter's children. 409 `coparent_cap` if any of those children already
 * have 2 ParentChildLink rows; 409 `already_invited` if a pending invite
 * already exists for the same invitee; 409 `already_linked` if the invitee
 * is already a parent on one of the kids.
 *
 * Returns the created row + the raw JWT token (the route includes it in the
 * dev response so a developer without Mailgun can copy/paste the accept URL).
 */
export async function createCoparentInvite(
  inviterId: string,
  baseUrl: string,
  input: CreateCoparentInviteRequest,
): Promise<{ invite: CoparentInviteRow; token: string }> {
  const inviter = await prisma.parentAccount.findUnique({
    where: { id: inviterId },
    select: { email: true, displayNameForKids: true },
  });
  if (!inviter) throw new HttpError(404, 'account_not_found', 'Account not found');

  const inviteeEmail = input.invitee_email.trim().toLowerCase();
  if (inviteeEmail === inviter.email.toLowerCase()) {
    throw new HttpError(409, 'self_invite', 'You cannot invite yourself');
  }

  // Inviter's kids — derived from ParentChildLink, not ChildProfile.parentId,
  // so that an existing co-parent can also invite a third (cap will still 409).
  const myLinks = await prisma.parentChildLink.findMany({
    where: { parentId: inviterId },
    select: { childId: true },
  });
  const childIds = myLinks.map((l) => l.childId);
  if (childIds.length === 0) {
    throw new HttpError(409, 'no_children', 'Add a child profile before inviting a co-parent');
  }

  // 2-parent cap: refuse if ANY of the kids is already at 2 links.
  const linkCounts = await prisma.parentChildLink.groupBy({
    by: ['childId'],
    where: { childId: { in: childIds } },
    _count: { parentId: true },
  });
  const capped = linkCounts.find((g) => g._count.parentId >= 2);
  if (capped) {
    throw new HttpError(409, 'coparent_cap', 'A child already has 2 linked parents');
  }

  // Don't double-invite: refuse if there's a pending invite OR the invitee is
  // already a linked parent.
  const existingPending = await prisma.coparentInvite.findFirst({
    where: { inviterParentId: inviterId, inviteeEmail, status: 'pending' },
  });
  if (existingPending) {
    throw new HttpError(409, 'already_invited', 'There is already a pending invite for this email');
  }
  const alreadyLinked = await prisma.parentAccount.findUnique({
    where: { email: inviteeEmail },
    include: {
      childLinks: { where: { childId: { in: childIds } }, select: { childId: true } },
    },
  });
  if (alreadyLinked && alreadyLinked.childLinks.length > 0) {
    throw new HttpError(409, 'already_linked', 'This parent is already linked to your children');
  }

  // Insert with a placeholder token, then update with the JWT keyed to the row id.
  const placeholder = `pending:${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + INVITE_TTL_S * 1000);
  const created = await prisma.coparentInvite.create({
    data: {
      inviterParentId: inviterId,
      inviteeEmail,
      childIds,
      personalNote: input.personal_note?.trim() || null,
      token: placeholder,
      expiresAt,
      status: 'pending',
    },
  });
  const { token } = await signInviteToken(created.id);
  const final = await prisma.coparentInvite.update({
    where: { id: created.id },
    data: { token },
  });

  // FamilyActivityLog: one row per child the invite covers.
  await prisma.familyActivityLog.createMany({
    data: childIds.map((childId) => ({
      childId,
      actorParentId: inviterId,
      action: 'coparent_invited' as const,
      payload: { invitee_email: inviteeEmail, invite_id: created.id },
    })),
  });

  // Fetch kid names for the email body.
  const kids = await prisma.childProfile.findMany({
    where: { id: { in: childIds } },
    select: { name: true },
  });
  const acceptUrl = `${baseUrl.replace(/\/$/, '')}/parent/coparent/accept?token=${encodeURIComponent(token)}`;
  await sendCoparentInvite({
    invitee_email: inviteeEmail,
    inviter_display: inviter.displayNameForKids || (inviter.email.split('@')[0] ?? inviter.email),
    kid_names: kids.map((k) => k.name),
    accept_url: acceptUrl,
    personal_note: input.personal_note ?? null,
  });

  return { invite: mapInviteRow(final), token };
}

// ─── Cancel invite ───────────────────────────────────────────────────────────

/** Cancel a pending invite the requester sent. 404 if not theirs, 409 if not pending. */
export async function cancelCoparentInvite(inviterId: string, inviteId: string): Promise<void> {
  const invite = await prisma.coparentInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.inviterParentId !== inviterId) {
    throw new HttpError(404, 'invite_not_found', 'Invite not found');
  }
  if (invite.status !== 'pending') {
    throw new HttpError(409, 'invite_not_pending', 'This invite is no longer pending');
  }
  await prisma.coparentInvite.update({
    where: { id: inviteId },
    data: { status: 'cancelled', resolvedAt: new Date() },
  });
}

// ─── Accept invite (FAM2) ───────────────────────────────────────────────────

/**
 * Accept the invite as the currently authenticated parent. The session's email
 * must match the invite's `inviteeEmail` (403 otherwise). Token must verify +
 * the row must be pending + not expired. On success: insert ParentChildLink
 * rows for each child (role=coparent), mark invite accepted, write activity
 * rows. Returns the kids the invitee now has access to.
 */
export async function acceptCoparentInvite(
  acceptingParentId: string,
  acceptingEmail: string,
  token: string,
): Promise<{ children: { id: string; name: string }[] }> {
  const claims = await verifyInviteToken(token);
  if (!claims) throw new HttpError(400, 'invalid_token', 'Invite token is invalid');

  const invite = await prisma.coparentInvite.findUnique({ where: { id: claims.inviteId } });
  if (!invite) throw new HttpError(404, 'invite_not_found', 'Invite not found');
  if (invite.status !== 'pending') {
    throw new HttpError(409, 'invite_not_pending', 'This invite is no longer pending');
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.coparentInvite.update({
      where: { id: invite.id },
      data: { status: 'expired', resolvedAt: new Date() },
    });
    throw new HttpError(410, 'invite_expired', 'This invite has expired');
  }
  if (invite.inviteeEmail.toLowerCase() !== acceptingEmail.toLowerCase()) {
    throw new HttpError(403, 'email_mismatch', 'This invite was sent to a different email');
  }
  if (invite.inviterParentId === acceptingParentId) {
    throw new HttpError(409, 'self_invite', 'You cannot accept your own invite');
  }

  // Recheck the 2-parent cap at accept-time (the inviter or a co-co-parent may
  // have linked someone else between invite and accept).
  const linkCounts = await prisma.parentChildLink.groupBy({
    by: ['childId'],
    where: { childId: { in: invite.childIds } },
    _count: { parentId: true },
  });
  const capped = linkCounts.find((g) => g._count.parentId >= 2);
  if (capped) {
    throw new HttpError(409, 'coparent_cap', 'A child has since reached the 2-parent cap');
  }

  // Idempotent inserts: skip kids the invitee is already linked to.
  const existing = await prisma.parentChildLink.findMany({
    where: { parentId: acceptingParentId, childId: { in: invite.childIds } },
    select: { childId: true },
  });
  const existingSet = new Set(existing.map((r) => r.childId));
  const newChildIds = invite.childIds.filter((id) => !existingSet.has(id));

  await prisma.$transaction([
    ...newChildIds.map((childId) =>
      prisma.parentChildLink.create({
        data: {
          parentId: acceptingParentId,
          childId,
          role: 'coparent',
          invitedBy: invite.inviterParentId,
        },
      }),
    ),
    prisma.coparentInvite.update({
      where: { id: invite.id },
      data: { status: 'accepted', resolvedAt: new Date() },
    }),
  ]);

  if (newChildIds.length > 0) {
    await prisma.familyActivityLog.createMany({
      data: newChildIds.map((childId) => ({
        childId,
        actorParentId: acceptingParentId,
        action: 'coparent_joined' as const,
        payload: { invite_id: invite.id, inviter_parent_id: invite.inviterParentId },
      })),
    });
  }

  const kids = await prisma.childProfile.findMany({
    where: { id: { in: invite.childIds } },
    select: { id: true, name: true },
  });
  return { children: kids };
}

// ─── Remove a co-parent (FAM1 remove button) ────────────────────────────────

/**
 * Remove a linked parent from every child the requester shares with them.
 * Phase 1 is intentionally simple — any linked parent can remove any other
 * (we surface "Retirer" only on co-parents in the UI). Refuses removing the
 * sole primary on a child without a successor (409 `last_primary`).
 */
export async function removeCoparent(
  requesterId: string,
  targetParentId: string,
): Promise<{ removed_child_ids: string[] }> {
  if (requesterId === targetParentId) {
    throw new HttpError(409, 'cannot_remove_self', 'Use Settings → Account to delete your own account');
  }

  const myLinks = await prisma.parentChildLink.findMany({
    where: { parentId: requesterId },
    select: { childId: true },
  });
  const childIds = myLinks.map((l) => l.childId);
  if (childIds.length === 0) {
    throw new HttpError(404, 'link_not_found', 'No shared children to unlink');
  }

  const toRemove = await prisma.parentChildLink.findMany({
    where: { parentId: targetParentId, childId: { in: childIds } },
  });
  if (toRemove.length === 0) {
    throw new HttpError(404, 'link_not_found', 'That parent is not linked to your children');
  }

  // Block removing the only primary on a child without a successor.
  for (const link of toRemove) {
    if (link.role !== 'primary') continue;
    const others = await prisma.parentChildLink.count({
      where: { childId: link.childId, parentId: { not: targetParentId }, role: 'primary' },
    });
    if (others === 0) {
      throw new HttpError(
        409,
        'last_primary',
        'Cannot remove the only primary parent for a child',
      );
    }
  }

  await prisma.parentChildLink.deleteMany({
    where: { parentId: targetParentId, childId: { in: childIds } },
  });
  await prisma.familyActivityLog.createMany({
    data: toRemove.map((l) => ({
      childId: l.childId,
      actorParentId: requesterId,
      action: 'coparent_removed' as const,
      payload: { removed_parent_id: targetParentId, role: l.role },
    })),
  });
  return { removed_child_ids: toRemove.map((l) => l.childId) };
}
