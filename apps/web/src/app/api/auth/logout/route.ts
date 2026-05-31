import type { OkResponse } from '@gabee/types';
import { route, json } from '@/lib/server/http';
import { clearSessionCookie } from '@/lib/server/auth';

export const runtime = 'nodejs';

export const POST = route(() => {
  const res = json<OkResponse>({ success: true });
  clearSessionCookie(res);
  return res;
});
