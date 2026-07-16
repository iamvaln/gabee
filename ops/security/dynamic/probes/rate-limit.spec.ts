import { test, expect } from '@playwright/test';

// The limiters bucket by client IP (`clientIpFrom` reads the first X-Forwarded-For
// entry). These probes deliberately EXHAUST a bucket, so they each claim their own
// synthetic IP: otherwise they'd drain the shared bucket that idor/authz's real
// logins depend on, and the suite would only pass when Playwright happened to run
// this file last (alphabetical luck) — a rename would have flipped it to false
// failures. Distinct IPs make the specs order-independent.
const LOGIN_PROBE_IP = '10.99.0.1';
const SIGNUP_PROBE_IP = '10.99.0.2';

// Login limiter = 5 / 5 min (apps/web/.../auth/login/route.ts). The 6th wrong
// attempt from the same IP MUST be rejected 429, not 401 — else brute-force is open.
test('auth brute-force is rate-limited (429 by the 6th attempt)', async ({ request }) => {
  let sawLimit = false;
  for (let i = 0; i < 8; i++) {
    const r = await request.post('/api/auth/login', {
      headers: { 'x-forwarded-for': LOGIN_PROBE_IP },
      data: { email: 'nobody@x.io', password: `wrong-${i}` },
    });
    if (r.status() === 429) { sawLimit = true; break; }
    expect(r.status(), `attempt ${i}`).toBe(401);
  }
  expect(sawLimit, 'no 429 after 8 bad logins — login limiter not enforced').toBe(true);
});

// Signup limiter = 5 / 15 min. Must trip BEFORE a send; target is EMAIL_PROVIDER=noop.
test('signup abuse is rate-limited (429 before the window fills)', async ({ request }) => {
  let sawLimit = false;
  for (let i = 0; i < 8; i++) {
    const r = await request.post('/api/auth/signup', {
      headers: { 'x-forwarded-for': SIGNUP_PROBE_IP },
      data: { email: `sec+${i}@example.com`, password: 'Aa1!aaaaaa' },
    });
    if (r.status() === 429) { sawLimit = true; break; }
  }
  expect(sawLimit, 'no 429 after 8 signups — signup limiter not enforced').toBe(true);
});
