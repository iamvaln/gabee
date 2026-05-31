import { z } from 'zod';
import type { OkResponse } from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { clearSessionCookie } from '@/lib/server/auth';
import { requestDeletion } from '@/lib/server/services/parent-account';

export const runtime = 'nodejs';

// Parent spec §10.6 — soft request: enqueue a GdprRequest(kind=erase). The
// admin executes the actual purge per the admin GDPR workflow (admin spec §9).
// We do NOT hard-delete here. We DO sign the parent out so the destructive
// confirmation is irreversible from the parent's side.
const DeleteSchema = z.object({
  email_confirm: z.string().min(1),
});

export const POST = route(async (req) => {
  const session = await requireParent(req);
  const input = await readJson(req, DeleteSchema);
  await requestDeletion(session.parentId, input.email_confirm);
  const res = json<OkResponse>({ success: true });
  clearSessionCookie(res);
  return res;
});
