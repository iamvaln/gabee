import { z } from 'zod';
import { MediaClearanceSchema, MediaTagsSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin } from '@/lib/server/http';
import { auditMedia, setClearance, setTags } from '@/lib/server/content-studio/media';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  cleared: z.boolean().optional(),
  note: MediaClearanceSchema.shape.note,
  tags: MediaTagsSchema.optional(),
});

// Clearance and tags: the owner and admins both clear media.
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireAdmin(req);
  const { id } = await ctx.params;
  const patch = await readJson(req, PatchSchema);
  let asset;
  if (patch.cleared !== undefined) {
    asset = await setClearance(id, { cleared: patch.cleared, note: patch.note }, session.parentId);
  }
  if (patch.tags) asset = await setTags(id, patch.tags);
  if (!asset) return json({ error: { code: 'validation_error', message: 'Rien à modifier.' } }, 422);
  await auditMedia(session.parentId, 'content.media.clearance', id, patch);
  return json({ asset });
});
