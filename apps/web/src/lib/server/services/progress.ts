import { Prisma } from '@gabee/db';
import {
  type ProgressSyncRequest,
  type ProgressSyncResponse,
  ProgressByModuleSchema,
  ProgressByModulePerLanguageSchema,
  defaultProgressByModule,
  defaultProgressByModulePerLanguage,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { mapChildProfile } from '../mappers';
import {
  mergeProgressByModule,
  mergeProgressByModulePerLanguage,
} from './progress-merge';

interface LockedRow {
  total_stars: number;
  progress_by_module: unknown;
  progress_by_module_per_language: unknown;
  badges: string[];
}

/**
 * Progress sync (product §8). Progress is CUMULATIVE, so a snapshot from one
 * device must never lower what's already on the server — even when a stale
 * second device (e.g. another tablet that synced before the first device's
 * gains landed) pushes a smaller absolute total. We therefore MERGE monotonically
 * (max stars/levels, union seen-ids + badges) instead of clobbering, and do it
 * inside a row-locked transaction so two near-simultaneous device syncs serialize
 * — without the lock, both could read the old value and the later write would
 * re-introduce the regression.
 *
 * NOTE: `total_stars` (cumulative correct answers) is merged with max here — a
 * safe floor that stops regressions. The fully-correct accumulation (immune to
 * concurrent multi-device earns) will derive it from the idempotent event stream
 * in a follow-up; max is the hotfix that stops kids losing points today.
 */
export async function syncProgress(
  parentId: string,
  req: ProgressSyncRequest,
): Promise<ProgressSyncResponse> {
  const owned = await prisma.childProfile.findFirst({
    where: { id: req.profile_id, parentId },
    select: { id: true },
  });
  if (!owned) throw new HttpError(404, 'profile_not_found', 'Child profile not found');

  const updated = await prisma.$transaction(async (tx) => {
    // Lock the row for the duration of the read-merge-write so concurrent syncs
    // for the same profile can't race and clobber each other.
    const rows = await tx.$queryRaw<LockedRow[]>`
      SELECT total_stars, progress_by_module, progress_by_module_per_language, badges
      FROM child_profiles WHERE id = ${req.profile_id}::uuid FOR UPDATE`;
    const cur = rows[0];
    if (!cur) throw new HttpError(404, 'profile_not_found', 'Child profile not found');

    const data: Prisma.ChildProfileUpdateInput = { lastActiveAt: new Date() };

    if (req.total_stars !== undefined) {
      // Monotonic: never below what's already stored.
      data.totalStars = Math.max(cur.total_stars, req.total_stars);
    }
    if (req.progress_by_module) {
      const server = ProgressByModuleSchema.safeParse(cur.progress_by_module);
      data.progressByModule = mergeProgressByModule(
        server.success ? server.data : defaultProgressByModule(),
        req.progress_by_module,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (req.progress_by_module_per_language) {
      const server = ProgressByModulePerLanguageSchema.safeParse(
        cur.progress_by_module_per_language,
      );
      data.progressByModulePerLanguage = mergeProgressByModulePerLanguage(
        server.success ? server.data : defaultProgressByModulePerLanguage(),
        req.progress_by_module_per_language,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (req.badges) {
      // Union — a stale device must never strip an earned badge.
      data.badges = [...new Set([...cur.badges, ...req.badges])];
    }

    return tx.childProfile.update({ where: { id: req.profile_id }, data });
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
