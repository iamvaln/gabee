import { NextResponse } from 'next/server';
import { route, requireParent, HttpError } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { recordFamilyActivity } from '@/lib/server/services/family-activity';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; coparentId: string }> };

/**
 * DELETE /api/profiles/[id]/coparents/[coparentId]
 *
 * Remove a kid from a co-parent's access — drops the
 * ParentChildLink(coparentId, childId, role:'coparent') row. After this, the
 * co-parent no longer sees this kid in their /parent/kids list, their
 * classification queue, kid-detail, message inbox, or limit overrides.
 *
 * Permission: either the PRIMARY parent of the kid (who manages co-parents)
 * OR the co-parent themselves (who can step away from a kid voluntarily).
 *
 * Idempotent — returns 204 if the link doesn't exist.
 */
export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id: childId, coparentId } = await ctx.params;

  // Resolve the primary parent — only they or the co-parent themselves can act.
  const kid = await prisma.childProfile.findUnique({
    where: { id: childId },
    select: { id: true, name: true, parentId: true },
  });
  if (!kid) throw new HttpError(404, 'profile_not_found', 'Child profile not found');

  const isPrimary = kid.parentId === session.parentId;
  const isSelfRemove = coparentId === session.parentId;
  if (!isPrimary && !isSelfRemove) {
    // Don't reveal whether the link exists — same 404 either way.
    throw new HttpError(404, 'profile_not_found', 'Child profile not found');
  }

  // Refuse to remove the primary link — that would orphan the kid (delete the
  // profile via DELETE /api/profiles/[id] instead).
  const link = await prisma.parentChildLink.findUnique({
    where: { parentId_childId: { parentId: coparentId, childId } },
    select: { role: true },
  });
  if (link?.role === 'primary') {
    throw new HttpError(409, 'cannot_remove_primary', 'Use DELETE /api/profiles/[id] to remove the kid entirely.');
  }

  // Idempotent: deleteMany succeeds with count 0 when the row doesn't exist.
  await prisma.parentChildLink.deleteMany({
    where: { parentId: coparentId, childId, role: 'coparent' },
  });

  void recordFamilyActivity({
    childId,
    actorParentId: session.parentId,
    action: 'coparent_removed',
    payload: { removed_parent_id: coparentId, self_remove: isSelfRemove },
  });

  return new NextResponse(null, { status: 204 });
});
