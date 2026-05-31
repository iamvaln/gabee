import { ClassifyRequestSchema, type ClassifyResponse } from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { classifySessions } from '@/lib/server/services/classifications';
import { recordFamilyActivity } from '@/lib/server/services/family-activity';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const session = await requireParent(req);
  const body = await readJson(req, ClassifyRequestSchema);
  const classified = await classifySessions(session.parentId, body.items, body.nudge_sent_at ?? null);

  // Family activity log — group classified sessions by child so the K1 feed
  // says "X classified N sessions for <kid>" instead of N separate lines.
  if (classified.length > 0) {
    const sessionIds = classified.map((c) => c.session_id);
    const sessions = await prisma.sessionClassification.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, profileId: true },
    });
    const perChild = new Map<string, string[]>();
    for (const s of sessions) {
      const arr = perChild.get(s.profileId) ?? [];
      arr.push(s.sessionId);
      perChild.set(s.profileId, arr);
    }
    for (const [childId, ids] of perChild) {
      void recordFamilyActivity({
        childId,
        actorParentId: session.parentId,
        action: 'session_classified',
        payload: { count: ids.length, session_ids: ids },
      });
    }
  }

  return json<ClassifyResponse>({ classified });
});
