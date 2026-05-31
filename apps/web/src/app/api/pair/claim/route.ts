import {
  ClaimDevicePairRequestSchema,
  type ClaimDevicePairResponse,
} from '@gabee/types';
import { route, readJson, json } from '@/lib/server/http';
import { claimPairToken } from '@/lib/server/services/devices';

export const runtime = 'nodejs';

// POST /api/pair/claim — kid PWA exchanges its one-shot pair JWT (from
// `?pair=…`) for a long-lived (~180d) parent-bearer JWT (parent spec §10.4
// / §12.3 P9). NO auth header required: the JWT IN THE BODY is the auth.
// Verifies signature + DB row (unused, unexpired), mints the device-bound
// bearer, creates the DeviceLink, writes `device_paired` activity rows.
export const POST = route(async (req) => {
  const input = await readJson(req, ClaimDevicePairRequestSchema);
  const result: ClaimDevicePairResponse = await claimPairToken({
    token: input.token,
    userAgentHint: input.user_agent_hint,
  });
  return json(result);
});
