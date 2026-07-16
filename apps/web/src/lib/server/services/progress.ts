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
  stars_baseline: number;
  progress_by_module: unknown;
  progress_by_module_per_language: unknown;
  badges: string[];
}

/**
 * How many stars the SERVER can independently account for.
 *
 * A star is one correct answer: every star-awarding screen does
 * `total_stars = profile.total_stars + correctCount`, and every module emits an
 * event that evidences it — numbers/words/sentences emit `question_answered`
 * carrying `correct`; keyboard emits `typing_word_completed` (a static-mode word is
 * always correct; a scrolling-mode word also fires on misses, so only
 * `completed_before_timeout: true` counts); code emits `code_level_solved`. Events
 * are append-only, deduped on `event_id`, never pruned, and the kid app drains them
 * BEFORE progress (`sync.ts`: drainEvents() then drainProgress()) — so by the time a
 * client claims a total, the evidence for it is already stored. Gifts are the one
 * server-side source (`gifts.ts` increments on claim), so they count too.
 *
 * `baseline` covers stars that predate this rule — a manual grant, or anything from
 * before ingest was reliable — so applying the cap can't freeze a real kid.
 */
async function countEvidencedStars(
  tx: Prisma.TransactionClient,
  profileId: string,
  baseline: number,
): Promise<number> {
  const [correctAnswers, typedWords, codeSolved, gifted] = await Promise.all([
    tx.event.count({
      where: { profileId, name: 'question_answered', payload: { path: ['correct'], equals: true } },
    }),
    tx.event.count({
      where: {
        profileId,
        name: 'typing_word_completed',
        OR: [
          { payload: { path: ['mode'], equals: 'static' } },
          { payload: { path: ['completed_before_timeout'], equals: true } },
        ],
      },
    }),
    tx.event.count({ where: { profileId, name: 'code_level_solved' } }),
    tx.kidGift.aggregate({
      where: { childId: profileId, status: 'claimed' },
      _sum: { amount: true },
    }),
  ]);
  return correctAnswers + typedWords + codeSolved + (gifted._sum.amount ?? 0) + baseline;
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
      SELECT total_stars, stars_baseline, progress_by_module, progress_by_module_per_language, badges
      FROM child_profiles WHERE id = ${req.profile_id}::uuid FOR UPDATE`;
    const cur = rows[0];
    if (!cur) throw new HttpError(404, 'profile_not_found', 'Child profile not found');

    const data: Prisma.ChildProfileUpdateInput = { lastActiveAt: new Date() };

    if (req.total_stars !== undefined) {
      // `total_stars` is CLIENT-DECLARED, so it is a claim, not a fact: the device
      // computes it locally and syncs the total. Monotonic-max alone only stopped it
      // going DOWN — a tampered client could POST `total_stars: 999999` and the server
      // stored it, converting devtools into real rewards via the gift economy.
      // So bound the claim by what the server can independently count.
      let baseline = cur.stars_baseline;
      let cap = await countEvidencedStars(tx, req.profile_id, baseline);

      // Stars already on the row that the evidence doesn't explain (a manual grant,
      // or anything predating reliable ingest) are grandfathered ONCE, here. Without
      // this, applying the cap would freeze a real kid's stars at their current value.
      // This can only ever ABSORB stars that already existed: a client cannot push
      // `total_stars` above the cap, so it cannot manufacture residue to widen it.
      if (cur.total_stars > cap) {
        baseline += cur.total_stars - cap;
        cap = cur.total_stars;
        data.starsBaseline = baseline;
      }

      // Never below what's stored (the original monotonic floor — concurrent devices
      // must not regress each other), and never above the evidence.
      data.totalStars = Math.max(cur.total_stars, Math.min(req.total_stars, cap));
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
