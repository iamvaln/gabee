import type { APIRequestContext } from '@playwright/test';

export const TESTERS = {
  A: { email: 'tester1@staging.gabee.app', password: 'staging-pass' },
  B: { email: 'tester2@staging.gabee.app', password: 'staging-pass' },
};

// Log in and return the JWT (usable as Authorization: Bearer). Throws on non-2xx.
export async function login(request: APIRequestContext, email: string, password: string): Promise<string> {
  const r = await request.post('/api/auth/login', { data: { email, password } });
  if (!r.ok()) throw new Error(`login failed ${r.status()}`);
  return (await r.json()).token;
}
