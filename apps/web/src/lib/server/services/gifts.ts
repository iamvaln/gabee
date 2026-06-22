import type { KidGift, PendingGiftsResponse, ClaimGiftResponse } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';

interface GiftRow {
  id: string;
  amount: number;
  label: string;
  status: KidGift['status'];
  createdAt: Date;
  claimedAt: Date | null;
}

function toDto(g: GiftRow): KidGift {
  return {
    id: g.id,
    amount: g.amount,
    label: g.label,
    status: g.status,
    created_at: g.createdAt.toISOString(),
    claimed_at: g.claimedAt ? g.claimedAt.toISOString() : null,
  };
}

/** Unclaimed gifts for one child (ownership-checked against the parent token). */
export async function listPendingGifts(
  parentId: string,
  childId: string,
): Promise<PendingGiftsResponse> {
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId },
    select: { id: true },
  });
  if (!child) throw new HttpError(404, 'profile_not_found', 'Child profile not found');

  const gifts = await prisma.kidGift.findMany({
    where: { childId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, amount: true, label: true, status: true, createdAt: true, claimedAt: true },
  });
  return { gifts: gifts.map(toDto) };
}

/**
 * Apply a pending gift: total_stars += amount (additive), flip to `claimed`, and
 * stamp the resulting total for audit. Row-locked so a double-tap / two devices
 * can't claim the same gift twice; idempotent if already claimed.
 */
export async function claimGift(parentId: string, giftId: string): Promise<ClaimGiftResponse> {
  return prisma.$transaction(async (tx) => {
    // Lock the gift row + resolve ownership via the child → parent join.
    const rows = await tx.$queryRaw<
      Array<{ id: string; child_id: string; amount: number; status: KidGift['status']; parent_id: string }>
    >`
      SELECT g.id, g.child_id, g.amount, g.status, c.parent_id
      FROM kid_gifts g JOIN child_profiles c ON c.id = g.child_id
      WHERE g.id = ${giftId}::uuid FOR UPDATE OF g`;
    const g = rows[0];
    if (!g || g.parent_id !== parentId) {
      throw new HttpError(404, 'gift_not_found', 'Gift not found');
    }

    if (g.status !== 'pending') {
      // Already claimed/revoked → return current total, don't add again.
      const child = await tx.childProfile.findUnique({
        where: { id: g.child_id },
        select: { totalStars: true },
      });
      return { gift_id: g.id, status: g.status, amount: g.amount, total_stars: child?.totalStars ?? 0 };
    }

    const updated = await tx.childProfile.update({
      where: { id: g.child_id },
      data: { totalStars: { increment: g.amount }, lastActiveAt: new Date() },
      select: { totalStars: true },
    });
    await tx.kidGift.update({
      where: { id: g.id },
      data: { status: 'claimed', claimedAt: new Date(), claimedTotalStars: updated.totalStars },
    });
    return { gift_id: g.id, status: 'claimed', amount: g.amount, total_stars: updated.totalStars };
  });
}

/**
 * Grant a pending gift (compensation / loyalty). The audit-bearing alternative to a
 * silent total_stars write — every grant is a row with amount + reason + grantedBy.
 * Used for the one-off compensation now; the admin gifting UI will call this later.
 */
export async function grantGift(input: {
  childId: string;
  amount: number;
  label: string;
  reason?: string;
  grantedBy?: string;
}): Promise<KidGift> {
  const g = await prisma.kidGift.create({
    data: {
      childId: input.childId,
      amount: input.amount,
      label: input.label,
      reason: input.reason,
      grantedBy: input.grantedBy,
      status: 'pending',
    },
    select: { id: true, amount: true, label: true, status: true, createdAt: true, claimedAt: true },
  });
  return toDto(g);
}
