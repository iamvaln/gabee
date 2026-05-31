import { SignupRequestSchema, type AuthSessionResponse } from '@gabee/types';
import { route, readJson, json } from '@/lib/server/http';
import { createSessionToken, setSessionCookie } from '@/lib/server/auth';
import { signup } from '@/lib/server/services/accounts';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const input = await readJson(req, SignupRequestSchema);
  const parent = await signup(input.email, input.password);
  const { token, expiresAt } = await createSessionToken({ parentId: parent.id, email: parent.email });
  const body: AuthSessionResponse = { token, expires_at: expiresAt.toISOString(), parent };
  const res = json(body, 201);
  setSessionCookie(res, token);
  return res;
});
