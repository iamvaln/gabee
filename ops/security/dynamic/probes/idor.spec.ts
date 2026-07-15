import { test, expect, request as apiRequest } from '@playwright/test';
import { login, TESTERS } from '../probe-lib';

// GET /api/profiles returns { profiles: ChildProfileSchema[] } — the kid id
// field is `id` (verified against packages/types/src/api/profiles.ts +
// packages/types/src/progress.ts's ChildProfileSchema; NOT `profile_id`).
async function listKidIds(request: import('@playwright/test').APIRequestContext, token: string): Promise<string[]> {
  const r = await request.get('/api/profiles', { headers: { authorization: `Bearer ${token}` } });
  expect(r.status(), 'GET /api/profiles as owner').toBe(200);
  const body = await r.json();
  return (Array.isArray(body) ? body : body.profiles ?? []).map((p: any) => p.id ?? p.profile_id).filter(Boolean);
}

// Tester A PATCHing tester B's kid profile MUST NOT succeed (owner-scoped → 403/404).
test('cross-family profile IDOR is denied', async ({ request, baseURL }) => {
  const tA = await login(request, TESTERS.A.email, TESTERS.A.password);
  // separate context for B so cookies/headers don't bleed
  const ctxB = await apiRequest.newContext({ baseURL });
  const tB = await login(ctxB, TESTERS.B.email, TESTERS.B.password);
  const bKids = await listKidIds(ctxB, tB);
  expect(bKids.length, 'fixture: tester B should own a kid').toBeGreaterThan(0);
  // NOTE: brief used `display_name`, but UpdateProfileRequestSchema
  // (packages/types/src/api/profiles.ts) defines the editable name field as
  // `name` — using the wrong field would 400 before authz is even reached.
  const r = await request.patch(`/api/profiles/${bKids[0]}`, {
    headers: { authorization: `Bearer ${tA}` }, data: { name: 'pwned' } });
  expect([403, 404], `A editing B's kid got ${r.status()}`).toContain(r.status());
  await ctxB.dispose();
});

// Tester A reading tester B's message must be 403/404 (owner-scoped). The id below
// is a REAL fixture message seeded for B (fromParentId=P2) in seed-fixtures.ts —
// not a nonexistent id — so a 404 here proves ownership scoping actually works
// (a vulnerable endpoint would return 200 and leak B's message text to A).
test('cross-family message read is denied', async ({ request }) => {
  const tA = await login(request, TESTERS.A.email, TESTERS.A.password);
  const r = await request.get('/api/messages/00000000-0000-4000-9000-0000000000b1', {
    headers: { authorization: `Bearer ${tA}` } });
  expect([403, 404], `A reading foreign message got ${r.status()}`).toContain(r.status());
});
