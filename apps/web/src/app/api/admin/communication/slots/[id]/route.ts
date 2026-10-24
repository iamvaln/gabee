import { UpdateSlotRequestSchema } from '@gabee/types';
import { json, readJson } from '@/lib/server/http';
import { afterSlotChange, updateSlot } from '@/lib/server/content-studio/weeks';
import { adminActor, idParam, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';
// An edit of a validated day that is already due writes its missing drafts.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// "Modifier" a day line. Returns the day, and a `warning` when a validated week falls below the English minimum.
export const PATCH = studioRoute<Ctx>(async (req, ctx) => {
  const actor = await adminActor(req);
  const id = await idParam(ctx);
  const patch = await readJson(req, UpdateSlotRequestSchema);
  await updateSlot(id, patch, actor);
  return json(await afterSlotChange(id, actor, new Date()));
});
