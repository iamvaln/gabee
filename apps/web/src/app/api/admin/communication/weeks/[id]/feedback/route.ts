import { DirectionFeedbackRequestSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { recordFeedback } from '@/lib/server/content-studio/feedback';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// 👍 / 👎 and « Ajouter un mot » on a direction card: the card's feedback as it stands now (both empty clears it).
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const body = await readJson(req, DirectionFeedbackRequestSchema);
  const feedback = await recordFeedback({ kind: 'direction', weekId: id, proposalIndex: body.proposal_index, sentiment: body.sentiment, note: body.note }, actor);
  return json({ feedback });
});
