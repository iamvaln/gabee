import { z } from 'zod';
import { KidStreakStateSchema, type KidStreakState } from '@gabee/types';
import { route, json, requireParent, HttpError } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { bumpStreakOnLessonCompleted } from '@/lib/server/services/healthy-use';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({}).optional();

/**
 * POST /api/profiles/[id]/lesson-completed — server-authoritative streak bump
 * (product §6.3, clock-manipulation prevention). The kid app calls this AFTER
 * the lesson_completed event has flushed; the server stamps `today` from its
 * own clock so a kid changing the device date can't grow their streak. Returns
 * the new streak state for the kid app to surface immediately.
 */
export const POST = route<Ctx>(async (req, ctx) => {
  const session = await requireParent(req);
  const { id } = await ctx.params;
  await BodySchema.parseAsync(await req.json().catch(() => ({})));
  const owned = await prisma.childProfile.findFirst({
    where: { id, parentId: session.parentId },
    select: { id: true },
  });
  let allowed = !!owned;
  if (!allowed) {
    const link = await prisma.parentChildLink.findFirst({
      where: { childId: id, parentId: session.parentId },
      select: { childId: true },
    });
    allowed = !!link;
  }
  if (!allowed) throw new HttpError(404, 'profile_not_found', 'Child profile not found');

  const streak = await bumpStreakOnLessonCompleted(id);
  return json<KidStreakState>(
    KidStreakStateSchema.parse({
      streak_days: streak.streak_days,
      longest_streak_days: streak.longest_streak_days,
      last_lesson_date: streak.last_lesson_date,
    }),
  );
});
