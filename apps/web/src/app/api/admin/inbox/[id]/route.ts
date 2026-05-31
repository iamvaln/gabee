import { UpdateInboxRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin } from '@/lib/server/http';
import { updateInbox } from '@/lib/server/services/admin-frontdesk';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// I2 — mark a message read / replied / archived (admin spec §8). Reply is status-only
// in MVP; the actual email goes out manually from Gmail.
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireAdmin(req);
  const { id } = await ctx.params;
  const patch = await readJson(req, UpdateInboxRequestSchema);
  return json({ message: await updateInbox(id, patch, session.parentId) });
});
