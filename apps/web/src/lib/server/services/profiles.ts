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
  const row = await prisma.childProfile.create({
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
