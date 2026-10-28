import { DraftFeedbackRequestSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { recordFeedback } from '@/lib/server/content-studio/feedback';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// « Commenter » a draft: a note to its writer (on the text) or to the Art director (on the media).
export const POST = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const body = await readJson(req, DraftFeedbackRequestSchema);
  return json({ feedback: await recordFeedback({ kind: 'draft', draftId: id, about: body.about, sentiment: body.sentiment, note: body.note }, actor) });
});
