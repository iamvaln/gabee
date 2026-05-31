import { z } from 'zod';
import { ModuleSchema, LevelSchema, FeedbackScopeSchema } from '@gabee/types';
import { route, json, readJson, requireParent } from '@/lib/server/http';
import { createFeedback } from '@/lib/server/services/admin-frontdesk';
import { recordFamilyActivity } from '@/lib/server/services/family-activity';

export const runtime = 'nodejs';

// Parent app → feedback source (admin spec §10). `@gabee/types` only ships the admin-side
// read/triage contracts (FeedbackRecord / UpdateFeedbackRequest), not a submission body,
// so the public request shape is defined locally from the shared enums. Optional
// `child_id` lets the parent app attach feedback to a kid context, which the K1
// family activity feed surfaces as "X left feedback for <kid>".
const SubmitFeedbackSchema = z.object({
  scope: FeedbackScopeSchema,
  target: z.object({
    module: ModuleSchema,
    level: LevelSchema.optional(),
    lesson_id: z.string().optional(),
  }),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  child_id: z.uuid().optional(),
});

// requireParent — a logged-in parent rates a module / level / lesson. The row is tied to
// the parent + the default curriculum so the admin feedback screen has a real source.
export const POST = route(async (req) => {
  const session = await requireParent(req);
  const body = await readJson(req, SubmitFeedbackSchema);
  const { id } = await createFeedback({
    parentId: session.parentId,
    scope: body.scope,
    target: body.target,
    rating: body.rating,
    comment: body.comment ?? null,
  });
  // Family activity log — only when the parent attached a kid context to the
  // feedback. Without a child_id we have no row to associate the log with.
  if (body.child_id) {
    void recordFamilyActivity({
      childId: body.child_id,
      actorParentId: session.parentId,
      action: 'feedback_left',
      payload: { feedback_id: id, rating: body.rating, scope: body.scope },
    });
  }
  return json({ id }, 201);
});
