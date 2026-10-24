import { json } from '@/lib/server/http';
import { auditContent } from '@/lib/server/content-studio/drafts';
import { proposeDirections } from '@/lib/server/content-studio/weeks';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// Retry the Strategist on a week stuck in `proposing` (its first run failed).
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const week = await proposeDirections(id, 'user_action', actor);
  await auditContent(actor, 'content.week.propose', 'content_week', id, { status: week.status });
  return json({ week });
});
