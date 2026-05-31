import {
  SendPairLinkRequestSchema,
  type SendPairLinkResponse,
} from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { createPairToken } from '@/lib/server/services/devices';

export const runtime = 'nodejs';

// POST /api/devices/pair — mint a one-shot pair JWT for the kid PWA, persist
// the DevicePairToken row, email the link (parent spec §10.4 / §12.3 P9).
// Response carries `pair_url` so a dev without Mailgun can copy the deep-link
// from the response and open it on the device manually.
export const POST = route(async (req) => {
  const session = await requireParent(req);
  const input = await readJson(req, SendPairLinkRequestSchema);
  const result = await createPairToken({
    parentId: session.parentId,
    targetEmail: input.target_email,
    label: input.label,
  });
  const body: SendPairLinkResponse = result;
  return json(body, 201);
});
