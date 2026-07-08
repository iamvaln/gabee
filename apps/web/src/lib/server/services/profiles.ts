import {
  DEFAULT_AVATAR_LOOK,
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

/**
 * A parent at the profile cap asks the operator to raise it. We don't
 * auto-grant — this lands a row in the admin Inbox (source
 * `profile_increase_request`) so the operator has a trackable count + can
 * follow up. Idempotent-ish by design: the admin dedupes; the endpoint
 * rate-limits to stop spam.
 */
export async function requestProfileIncrease(parentId: string): Promise<void> {
  const account = await prisma.parentAccount.findUnique({
    where: { id: parentId },
    select: { email: true, children: { select: { name: true } } },
  });
  if (!account) throw new HttpError(404, 'account_not_found', 'Account not found');
  const names = account.children.map((c) => c.name).join(', ') || '—';
  await prisma.inboxMessage.create({
    data: {
      name: account.email,
      email: account.email,
      subject: 'Demande de profils supplémentaires',
      message:
        `${account.email} a atteint la limite de ${MAX_CHILDREN} profils ` +
        `(${account.children.length} enfant(s) : ${names}) et souhaite en ajouter davantage.`,
      source: 'profile_increase_request',
    },
  });
}

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
        // Recolour look — fall back to the default for any dimension the
        // client omits. `avatar` (legacy enum) is left null on new rows.
        skinTone: input.skin_tone ?? DEFAULT_AVATAR_LOOK.skinTone,
        hairColor: input.hair_color ?? DEFAULT_AVATAR_LOOK.hairColor,
        hairStyle: input.hair_style ?? DEFAULT_AVATAR_LOOK.hairStyle,
        shirtColor: input.shirt_color ?? DEFAULT_AVATAR_LOOK.shirtColor,
        language: input.language,
        birthDate: input.birth_date ? new Date(input.birth_date) : null,
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
    // Activation funnel: stamp firstKidAddedAt on the parent who created
    // this kid, but only the first time. Inside the same transaction so
    // a partial failure rolls everything back together. updateMany lets
    // the WHERE filter short-circuit when the field is already set — no
    // need to round-trip to read the row first.
    await tx.parentAccount.updateMany({
      where: { id: parentId, firstKidAddedAt: null },
      data: { firstKidAddedAt: new Date() },
    });
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
      ...(input.skin_tone !== undefined ? { skinTone: input.skin_tone } : {}),
      ...(input.hair_color !== undefined ? { hairColor: input.hair_color } : {}),
      ...(input.hair_style !== undefined ? { hairStyle: input.hair_style } : {}),
      ...(input.shirt_color !== undefined ? { shirtColor: input.shirt_color } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.birth_date !== undefined ? { birthDate: new Date(input.birth_date) } : {}),
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
