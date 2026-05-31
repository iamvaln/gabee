import { ContactRequestSchema } from '@gabee/types';
import { route, json, readJson } from '@/lib/server/http';
import { createContactMessage } from '@/lib/server/services/admin-frontdesk';

export const runtime = 'nodejs';

// Public landing contact form (admin spec §8). NO auth — anyone can reach the marketing
// page. Creates an InboxMessage with source `landing_contact`.
export const POST = route(async (req) => {
  const body = await readJson(req, ContactRequestSchema);
  const { id } = await createContactMessage(body);
  return json({ id }, 201);
});
