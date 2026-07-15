import { test, expect } from '@playwright/test';
import { login, TESTERS } from '../probe-lib';

// A parent token on an admin route MUST be 403 (role read live from DB, see
// requireAdmin in apps/web/src/lib/server/http.ts).
// NOTE: brief targeted `/api/admin/users`, but that path has no route.ts (only
// its children admins/, children/, parents/ do — confirmed via `find` against
// apps/web/src/app/api/admin/users/) and 404s regardless of auth, which would
// make this probe vacuous. Using the real requireAdmin-guarded sibling route
// `/api/admin/users/parents` (GET, apps/web/src/app/api/admin/users/parents/route.ts)
// instead so the probe actually exercises the authz check.
test('parent token is rejected from admin API (403)', async ({ request }) => {
  const tA = await login(request, TESTERS.A.email, TESTERS.A.password);
  const r = await request.get('/api/admin/users/parents', { headers: { authorization: `Bearer ${tA}` } });
  expect(r.status(), 'parent on /api/admin/users/parents').toBe(403);
});

// An unauthenticated request to a gated route MUST be 401.
test('unauthenticated request to a gated route is 401', async ({ request }) => {
  const r = await request.get('/api/profiles');
  expect(r.status(), 'anon on /api/profiles').toBe(401);
});
