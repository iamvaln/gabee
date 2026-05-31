import { CreateGdprRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin } from '@/lib/server/http';
import { listGdpr, createGdpr } from '@/lib/server/services/admin-frontdesk';

export const runtime = 'nodejs';

// G1 — GDPR queue (admin spec §9). Treated as admin-allowed; the spec doesn't gate the
// queue to super_admin.
export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await listGdpr());
});

// Log a GDPR request received out-of-band (email). Starts at status `new`.
export const POST = route(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req, CreateGdprRequestSchema);
  return json({ request: await createGdpr(body) }, 201);
});
