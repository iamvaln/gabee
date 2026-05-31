import { z } from 'zod';
import { KidStreakStateSchema, type KidStreakState } from '@gabee/types';
import { route, json, requireParent } from '@/lib/server/http';
import { assertParentCanAccessKid } from '@/lib/server/kid-access';
import { bumpStreakOnLessonCompleted } from '@/lib/server/services/healthy-use';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({}).optional();

/**
 * POST /api/profiles/[id]/lesson-completed — server-authoritative streak bump
 * (product §6.3, clock-manipulation prevention). The kid app calls this AFTER
 * the lesson_completed event has flushed; the server stamps `today` from its
 * own clock so a kid changing the device date can't grow their streak.
 *
 * Accessible to primary parent + linked co-parents (the kid app's bearer
 * token belongs to whichever parent paired the device — both should be able
 * to bump the streak for a shared kid).
 */
export const POST = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  await BodySchema.parseAsync(await req.json().catch(() => ({})));
  await assertParentCanAccessKid(session.parentId, id);

  const streak = await bumpStreakOnLessonCompleted(id);
  return json<KidStreakState>(
    KidStreakStateSchema.parse({
      streak_days: streak.streak_days,
      longest_streak_days: streak.longest_streak_days,
      last_lesson_date: streak.last_lesson_date,
    }),
  );
});
