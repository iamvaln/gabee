import {
  defaultProgressByModule,
  defaultProgressByModulePerLanguage,
  type ChildProfile,
  type CreateProfileRequest,
  type UpdateProfileRequest,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { mapChildProfile } from '../mappers';

const MAX_CHILDREN = 3;

export async function listProfiles(parentId: string): Promise<ChildProfile[]> {
  const rows = await prisma.childProfile.findMany({
    where: { parentId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(mapChildProfile);
}

export async function createProfile(
  parentId: string,
  input: CreateProfileRequest,
): Promise<ChildProfile> {
  const count = await prisma.childProfile.count({ where: { parentId } });
  if (count >= MAX_CHILDREN) {
    throw new HttpError(409, 'too_many_children', `A parent can have at most ${MAX_CHILDREN} profiles`);
  }

  // Co-parent extension: when the creating parent already has linked
  // co-parents, the client decides whether the new kid is shared with all of
  // them. Default = extend (true) so the historical behaviour ("two-parent
  // family sees everything") holds without the client needing to flag it.
  const extend = input.share_with_existing_coparents ?? true;
  const coparents = extend
    ? await prisma.parentChildLink.findMany({
        where: { parentId, role: 'coparent' },
        select: { childId: true },
      })
    : [];
  // Distinct co-parent ids — the inviter could be linked to the same co-parent
  // through multiple kids; one link per (parent, child) pair is the goal.
  const coparentIds = Array.from(
    new Set(
      // We need the co-parent USER ids, not childIds. Re-query the link table
      // with childId filter to derive the co-parent set.
      await prisma.parentChildLink
        .findMany({
          where: { childId: { in: coparents.map((c) => c.childId) }, role: 'coparent' },
          select: { parentId: true },
        })
        .then((rs) => rs.map((r) => r.parentId)),
    ),
  );

  // Single transaction: create the kid row, the primary ParentChildLink, and
  // any co-parent extension links atomically. The data model expects EVERY
  // parent-child relationship to live in ParentChildLink (the role enum has
  // both `primary` and `coparent`); `createCoparentInvite` reads from there.
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.childProfile.create({
      data: {
        parentId,
        name: input.name,
        avatar: input.avatar,
        language: input.language,
        audioEnabled: input.audio_enabled ?? true,
        progressByModule: defaultProgressByModule(),
        progressByModulePerLanguage: defaultProgressByModulePerLanguage(),
      },
    });
    await tx.parentChildLink.create({
      data: { parentId, childId: created.id, role: 'primary' },
    });
    if (coparentIds.length > 0) {
      await tx.parentChildLink.createMany({
        data: coparentIds.map((cpId) => ({
          parentId: cpId,
          childId: created.id,
          role: 'coparent' as const,
          invitedBy: parentId,
        })),
        skipDuplicates: true,
      });
    }
    return created;
  });
  return mapChildProfile(row);
}

export async function updateProfile(
  parentId: string,
  id: string,
  input: UpdateProfileRequest,
): Promise<ChildProfile> {
  const existing = await prisma.childProfile.findFirst({ where: { id, parentId } });
  if (!existing) throw new HttpError(404, 'profile_not_found', 'Child profile not found');

  const row = await prisma.childProfile.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.audio_enabled !== undefined ? { audioEnabled: input.audio_enabled } : {}),
    },
  });
  return mapChildProfile(row);
}

export async function deleteProfile(parentId: string, id: string): Promise<void> {
  const existing = await prisma.childProfile.findFirst({ where: { id, parentId } });
  if (!existing) throw new HttpError(404, 'profile_not_found', 'Child profile not found');
  await prisma.childProfile.delete({ where: { id } });
}
