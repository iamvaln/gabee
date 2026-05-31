import { Prisma } from '@gabee/db';
import type { ProgressSyncRequest, ProgressSyncResponse } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { mapChildProfile } from '../mappers';

/**
 * Progress sync (product §8). The kid is the only writer for their own progress, so we
 * apply the pushed snapshot (last-write-wins) and return the authoritative merged state.
 */
export async function syncProgress(
  parentId: string,
  req: ProgressSyncRequest,
): Promise<ProgressSyncResponse> {
  const child = await prisma.childProfile.findFirst({ where: { id: req.profile_id, parentId } });
  if (!child) throw new HttpError(404, 'profile_not_found', 'Child profile not found');

  const updated = await prisma.childProfile.update({
    where: { id: req.profile_id },
    data: {
      lastActiveAt: new Date(),
      ...(req.progress_by_module
        ? { progressByModule: req.progress_by_module as Prisma.InputJsonValue }
        : {}),
      ...(req.progress_by_module_per_language
        ? {
            progressByModulePerLanguage:
              req.progress_by_module_per_language as Prisma.InputJsonValue,
          }
        : {}),
      ...(req.total_stars !== undefined ? { totalStars: req.total_stars } : {}),
      ...(req.badges ? { badges: req.badges } : {}),
    },
  });

  const dto = mapChildProfile(updated);
  return {
    profile_id: dto.id,
    server_ts: new Date().toISOString(),
    progress_by_module: dto.progress_by_module,
    progress_by_module_per_language: dto.progress_by_module_per_language,
    total_stars: dto.total_stars,
    badges: dto.badges,
  };
}
