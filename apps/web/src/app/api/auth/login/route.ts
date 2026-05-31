import { LoginRequestSchema, type AuthSessionResponse } from '@gabee/types';
import { route, readJson, json } from '@/lib/server/http';
import { createSessionToken, setSessionCookie } from '@/lib/server/auth';
import { login } from '@/lib/server/services/accounts';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const input = await readJson(req, LoginRequestSchema);
  const parent = await login(input.email, input.password);
  const { token, expiresAt } = await createSessionToken({ parentId: parent.id, email: parent.email });
  const body: AuthSessionResponse = { token, expires_at: expiresAt.toISOString(), parent };
  const res = json(body);
  setSessionCookie(res, token);
  return res;
});
