import { SlotFeedbackRequestSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { recordFeedback } from '@/lib/server/content-studio/feedback';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// « Commenter » a day title: a note to the Strategist (added to the earlier ones).
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const body = await readJson(req, SlotFeedbackRequestSchema);
  return json({ feedback: await recordFeedback({ kind: 'title', slotId: id, sentiment: body.sentiment, note: body.note }, actor) });
});
