import type { MeResponse } from '@gabee/types';
import { route, json, requireParent } from '@/lib/server/http';
import { getAccount } from '@/lib/server/services/accounts';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  const session = await requireParent(req);
  const parent = await getAccount(session.parentId);
  return json<MeResponse>({ parent });
});
