# Auth & Pairing Integration Tests (Phase 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the auth token lifecycle (signup → email confirmation → login → password reset, parent + admin) and device pairing under integration test against real Postgres — the layer the spec calls out as "exactly the code mocks lie about."

**Architecture:** Phase 3 of `docs/superpowers/specs/2026-07-14-test-strategy-design.md`, split in two: **3a (this plan)** = Layer-2 service + Layer-3 route integration for auth & pairing; **3b (next plan)** = parent/admin Playwright e2e (signup→confirm→settings, admin login→content→users). Tests are `*.integration.test.ts` (the phase-2a convention, already excluded from the unit glob and run by `test:integration` against `gabee_test` with `--test-concurrency=1`). New shared test helpers live in `apps/web/src/test/` because they depend on the app's scrypt hashing (`hashPassword`), which `packages/db` cannot import.

**Tech Stack:** node:test (+ `mock`) via tsx, `@gabee/db/testing` (`createTestClient`/`resetDb`/`createParent`/`createChild`), real Postgres 14, jose session JWTs, scrypt credentials — all invoked as functions (`POST(new Request())`), no HTTP server.

## Global Constraints

- **Never add `Co-Authored-By`/AI-attribution trailers to commits or PR bodies** (user rule).
- **Zero production code changes.** This is a test-only phase. The one permitted non-test edit is adding pure-additive test-only exports IF a task proves it unavoidable (see the rate-limit note below) — and only after trying the header-based workaround first; if you reach for it, STOP and report DONE_WITH_CONCERNS naming the exact export.
- **Two hard truths from research, baked into every task:**
  1. `createParent` (from `@gabee/db/testing`) creates a parent with **no `ParentCredential` and `emailConfirmedAt = null`** — such a parent **cannot** log in via the real `login()` service. Any test needing a login-able parent MUST use the new `createLoginableParent` helper (Task 1).
  2. Confirmation/reset rows store **`sha256(rawToken)`**, never the raw token (the raw token lives only in the noop-"sent" email). A test that needs a *usable* token MUST generate its own raw token and seed the row with its sha256 (the `seedEmailConfirmation`/`seedPasswordReset` helpers, Task 1) — you cannot recover a usable token from a row the service created.
- **Rate limiting is in-memory per process** (`rate-limit.ts` `const buckets = new Map()`, keyed by client IP + scope) and has no reset hook. Since `--test-concurrency=1` runs every integration file in ONE process, calls accumulate. **Default rule:** every request the helper builds carries a **unique `x-forwarded-for` IP** so tests never trip each other's limits. The rate-limit-behavior tests deliberately reuse ONE fixed IP to exhaust a bucket. (Confirm in Task 1 that the route derives its bucket IP from `x-forwarded-for`/`x-real-ip` via `request-meta`; if it does not, that is the one place a test-only `__resetRateLimits()` export may be justified — report it.)
- **Email in tests is the noop provider** (`email.ts` falls back to `noop` when no `MAILGUN_*`/`RESEND_*`/`EMAIL_PROVIDER` env is set — which is the case under `setup-integration.ts`). Never set those env vars; never assert on email delivery, only on DB state.
- `*.integration.test.ts`, first import is `'../../../test/setup-integration'` (depth per file), `--test-concurrency=1`, one shared `createTestClient()`, `beforeEach(() => resetDb(prisma))`, `after(() => prisma.$disconnect())`.
- Node 20, pnpm, repo root = the worktree root. Branch `feature/test-auth-pairing` off `origin/main`.

---

### Task 0: Branch

- [ ] **Step 1:** Worktree/branch `feature/test-auth-pairing` off `origin/main` (handled by worktree tooling; verify `git status -sb` and `git merge-base --is-ancestor origin/main HEAD`). Fresh worktrees need `packages/db/.env` + `pnpm --filter @gabee/db run db:generate` before web builds/tests.

---

### Task 1: Test helpers — login-able parents, request builder, token-row seeders

**Files:**
- Create: `apps/web/src/test/factories.ts`
- Modify: `apps/web/src/test/auth.ts` (generalize `authedRequest`; keep `parentToken` as-is)
- Test: `apps/web/src/test/factories.integration.test.ts` (self-test proving the helpers produce login-able state + usable tokens)

**Interfaces:**
- Consumes: `hashPassword` from `@/lib/server/auth`, `createParent` from `@gabee/db/testing`, `PrismaClient`, `NextRequest`, `PARENT_SESSION_COOKIE`/`ADMIN_SESSION_COOKIE` from `@/lib/server/env`.
- Produces (used by Tasks 2-6):
  - `createLoginableParent(prisma, opts?): Promise<{ parent, password }>` — real scrypt `ParentCredential` + `emailConfirmedAt` set; `opts.role` for admin/super_admin, `opts.confirmed=false` to leave unconfirmed, `opts.password` override.
  - `seedEmailConfirmation(prisma, parentId, opts?): Promise<{ rawToken }>` — inserts an `EmailConfirmation` storing `sha256(rawToken)`; `opts.expiresAt`, `opts.consumedAt`.
  - `seedPasswordReset(prisma, parentId, opts?): Promise<{ rawToken }>` — same for `PasswordReset`.
  - `webRequest(url, { method?, body?, cookie?, bearer?, ip? }): NextRequest` — general request builder; unique random `x-forwarded-for` unless `ip` given; sets one cookie by name (`cookie: { name, value }`) or an `Authorization: Bearer`.
  - `parentCookie(token)` / `adminCookie(token)` → `{ name, value }` helpers.

- [ ] **Step 1: Write the failing self-test** — `apps/web/src/test/factories.integration.test.ts`:

```ts
import './setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createHash } from 'node:crypto';
import { login } from '@/lib/server/services/accounts';
import { createLoginableParent, seedEmailConfirmation, seedPasswordReset } from './factories';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('createLoginableParent produces a parent that login() accepts', async () => {
  const { parent, password } = await createLoginableParent(prisma);
  const logged = await login(parent.email, password); // real scrypt verify + confirmed gate
  assert.equal(logged.id, parent.id);
});

test('createLoginableParent({ confirmed: false }) is rejected by the confirmation gate', async () => {
  const { parent, password } = await createLoginableParent(prisma, { confirmed: false });
  await assert.rejects(() => login(parent.email, password), /email_not_confirmed/);
});

test('createLoginableParent({ role }) sets the account role', async () => {
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  const row = await prisma.parentAccount.findUniqueOrThrow({ where: { id: parent.id } });
  assert.equal(row.role, 'admin');
});

test('seedEmailConfirmation stores sha256 of the returned raw token', async () => {
  const { parent } = await createLoginableParent(prisma, { confirmed: false });
  const { rawToken } = await seedEmailConfirmation(prisma, parent.id);
  const row = await prisma.emailConfirmation.findFirstOrThrow({ where: { parentId: parent.id } });
  assert.equal(row.tokenHash, createHash('sha256').update(rawToken).digest('hex'));
  assert.equal(row.consumedAt, null);
});

test('seedPasswordReset stores sha256 of the returned raw token', async () => {
  const { parent } = await createLoginableParent(prisma);
  const { rawToken } = await seedPasswordReset(prisma, parent.id);
  const row = await prisma.passwordReset.findFirstOrThrow({ where: { parentId: parent.id } });
  assert.equal(row.tokenHash, createHash('sha256').update(rawToken).digest('hex'));
});
```

- [ ] **Step 2: Confirm the token-hash algorithm before implementing.** Read `apps/web/src/lib/server/services/email-confirmation.ts` and `password-reset.ts` `hash()` helpers — confirm they are exactly `createHash('sha256').update(token).digest('hex')` (research says so). If either differs (e.g. base64, or an HMAC with a secret), the seeders MUST match it byte-for-byte, and the assertions above must use the same algorithm. The seeded row is only usable if its hash matches what the consume service computes.

- [ ] **Step 3: Implement `apps/web/src/test/factories.ts`:**

```ts
import { randomBytes, createHash } from 'node:crypto';
import type { PrismaClient, ParentAccount, AccountRole } from '@gabee/db';
import { createParent } from '@gabee/db/testing';
import { hashPassword } from '@/lib/server/auth';

const DEFAULT_PASSWORD = 'test-Password-123';

export async function createLoginableParent(
  prisma: PrismaClient,
  opts: { password?: string; role?: AccountRole; confirmed?: boolean; email?: string } = {},
): Promise<{ parent: ParentAccount; password: string }> {
  const password = opts.password ?? DEFAULT_PASSWORD;
  const { hash, salt } = await hashPassword(password);
  const parent = await createParent(prisma, {
    ...(opts.email ? { email: opts.email } : {}),
    ...(opts.role ? { role: opts.role } : {}),
    emailConfirmedAt: opts.confirmed === false ? null : new Date(),
    credentials: { create: { hash, salt, algorithm: 'scrypt' } },
  } as never);
  return { parent, password };
}

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex'); // MUST match the service's hash() — verify in Task 1 Step 2
}

export async function seedEmailConfirmation(
  prisma: PrismaClient,
  parentId: string,
  opts: { expiresAt?: Date; consumedAt?: Date | null } = {},
): Promise<{ rawToken: string }> {
  const rawToken = randomBytes(32).toString('base64url');
  await prisma.emailConfirmation.create({
    data: {
      parentId,
      tokenHash: sha256(rawToken),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      consumedAt: opts.consumedAt ?? null,
    },
  });
  return { rawToken };
}

export async function seedPasswordReset(
  prisma: PrismaClient,
  parentId: string,
  opts: { expiresAt?: Date; consumedAt?: Date | null } = {},
): Promise<{ rawToken: string }> {
  const rawToken = randomBytes(32).toString('base64url');
  await prisma.passwordReset.create({
    data: {
      parentId,
      tokenHash: sha256(rawToken),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
      consumedAt: opts.consumedAt ?? null,
    },
  });
  return { rawToken };
}
```

(If `createParent`'s override type rejects the nested `credentials.create`, seed the credential in a second `prisma.parentCredential.create({ data: { parentId: parent.id, hash, salt, algorithm: 'scrypt' } })` call instead — the assertions are the contract. Confirm `AccountRole` is exported from `@gabee/db`; if not, import it from `@gabee/db` generated client path used elsewhere, or type `role` as `'parent' | 'admin' | 'super_admin'`.)

- [ ] **Step 4: Generalize the request builder** in `apps/web/src/test/auth.ts`. Keep the existing `parentToken`; keep `authedRequest` working (Task existing callers depend on it) but add the richer `webRequest` + cookie helpers. Read the current file first, then add:

```ts
import { PARENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE } from '@/lib/server/env';
import { randomBytes } from 'node:crypto';

export function parentCookie(token: string): { name: string; value: string } {
  return { name: PARENT_SESSION_COOKIE, value: token };
}
export function adminCookie(token: string): { name: string; value: string } {
  return { name: ADMIN_SESSION_COOKIE, value: token };
}

export function webRequest(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
    cookie?: { name: string; value: string };
    bearer?: string;
    ip?: string;
  } = {},
): NextRequest {
  const headers: Record<string, string> = {
    // Unique IP per request so the in-memory rate limiter never bleeds across tests.
    'x-forwarded-for': opts.ip ?? `10.${randomBytes(3).join('.')}`,
  };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.cookie) headers['cookie'] = `${opts.cookie.name}=${opts.cookie.value}`;
  if (opts.bearer) headers['authorization'] = `Bearer ${opts.bearer}`;
  return new NextRequest(url, {
    method: opts.method ?? 'POST',
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}
```

(Verify `PARENT_SESSION_COOKIE`/`ADMIN_SESSION_COOKIE` are exported from `@/lib/server/env` — research says yes, lines 146-147. Verify the route reads its rate-limit IP from `x-forwarded-for` by reading `apps/web/src/lib/server/request-meta.ts` + `rate-limit.ts`; if it reads a different header, set that one instead and note it.)

- [ ] **Step 5: Run** — `pnpm --filter @gabee/web run test:integration` → the self-test file passes (5/5); the existing integration files (events/progress) still pass, unchanged count. Then `pnpm --filter @gabee/web run test` (unit glob still excludes integration; count unchanged).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/test/factories.ts apps/web/src/test/auth.ts apps/web/src/test/factories.integration.test.ts
git commit -m "test(web/auth): login-able-parent + token-row seeders + general request builder for auth integration"
```

---

### Task 2: Signup + email-confirmation integration

**Files:**
- Test: `apps/web/src/lib/server/services/accounts-signup.integration.test.ts`
- Test: `apps/web/src/app/api/auth/confirm-email/route.integration.test.ts`

**Interfaces:**
- Consumes: `signup` from `@/lib/server/services/accounts`; `consumeEmailConfirmation` from `@/lib/server/services/email-confirmation`; `POST` from `apps/web/src/app/api/auth/confirm-email/route.ts`; Task-1 helpers.
- Produces: nothing downstream.

- [ ] **Step 1: Write the signup service test** — `accounts-signup.integration.test.ts`:

```ts
import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { signup } from './accounts';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('signup creates the account + one scrypt credential, unconfirmed', async () => {
  const parent = await signup('New.Person@Example.com', 'a-good-password');
  const row = await prisma.parentAccount.findUniqueOrThrow({
    where: { id: parent.id },
    include: { credentials: true },
  });
  assert.equal(row.email, 'new.person@example.com'); // normalized: trim + lowercase
  assert.equal(row.emailConfirmedAt, null);
  assert.equal(row.credentials.length, 1);
  assert.equal(row.credentials[0]!.algorithm, 'scrypt');
  assert.notEqual(row.credentials[0]!.hash, 'a-good-password'); // stored hashed, never plaintext
});

test('signup on an existing email is rejected (409 email_taken)', async () => {
  await signup('dupe@example.com', 'a-good-password');
  await assert.rejects(
    () => signup('dupe@example.com', 'another-password'),
    (e: unknown) => e instanceof HttpError && e.status === 409,
  );
});
```

(If `signup`'s signature or normalization differs from research — e.g. it does not lowercase — align the assertion to the real behavior; the "hashed not plaintext" and "409 on dupe" assertions are the contract. If disposable-email rejection is easy to exercise, add a case: `signup('x@mailinator.com', ...)` rejects 400 — but only if `isDisposableEmail` actually lists that domain; check `disposable-emails.ts` first.)

- [ ] **Step 2: Write the confirm-email route test** — `confirm-email/route.integration.test.ts`:

```ts
import '../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent, seedEmailConfirmation, webRequest } from '../../../../test/auth';
import { POST } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('a valid token confirms the account and is single-use', async () => {
  const { parent } = await createLoginableParent(prisma, { confirmed: false });
  const { rawToken } = await seedEmailConfirmation(prisma, parent.id);

  const res = await POST(webRequest('http://localhost/api/auth/confirm-email', { body: { token: rawToken } }));
  assert.equal(res.status, 200);
  const confirmed = await prisma.parentAccount.findUniqueOrThrow({ where: { id: parent.id } });
  assert.notEqual(confirmed.emailConfirmedAt, null);

  // replay: same token again is refused, account stays confirmed
  const replay = await POST(webRequest('http://localhost/api/auth/confirm-email', { body: { token: rawToken } }));
  assert.ok(replay.status >= 400);
});

test('an expired token is refused and does not confirm', async () => {
  const { parent } = await createLoginableParent(prisma, { confirmed: false });
  const { rawToken } = await seedEmailConfirmation(prisma, parent.id, { expiresAt: new Date(Date.now() - 1000) });

  const res = await POST(webRequest('http://localhost/api/auth/confirm-email', { body: { token: rawToken } }));
  assert.ok(res.status >= 400);
  const row = await prisma.parentAccount.findUniqueOrThrow({ where: { id: parent.id } });
  assert.equal(row.emailConfirmedAt, null);
});

test('a garbage token is refused (400)', async () => {
  const res = await POST(webRequest('http://localhost/api/auth/confirm-email', { body: { token: 'x'.repeat(43) } }));
  assert.ok(res.status >= 400);
});
```

(The confirm route wrapper's handler signature: read `apps/web/src/app/api/auth/confirm-email/route.ts` — if `POST` takes a second `ctx` arg, pass `undefined` as in the phase-2b route test. The garbage-token min length: the route uses `z.string().min(20)`; `'x'.repeat(43)` clears the length check so the failure is the real "invalid/expired token" path, not a schema rejection — keep it ≥20 chars.)

- [ ] **Step 3: Run** — `pnpm --filter @gabee/web run test:integration` → all pass. Any assertion failing against the real service = product bug: STOP and report.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/server/services/accounts-signup.integration.test.ts apps/web/src/app/api/auth/confirm-email/route.integration.test.ts
git commit -m "test(web/auth): signup hashing + email-confirmation consume/expiry/replay against real Postgres"
```

---

### Task 3: Login + session integration (parent + admin cookie boundary, rate limit)

**Files:**
- Test: `apps/web/src/app/api/auth/login/route.integration.test.ts`

**Interfaces:**
- Consumes: `POST` from `apps/web/src/app/api/auth/login/route.ts`; Task-1 `createLoginableParent`/`webRequest`; `PARENT_SESSION_COOKIE`/`ADMIN_SESSION_COOKIE`.
- Produces: the cookie-assertion pattern (reading `res.cookies.get(name)`) that Task 6 reuses.

- [ ] **Step 1: Write the test** — `login/route.integration.test.ts`:

```ts
import '../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { PARENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE } from '@/lib/server/env';
import { createLoginableParent, webRequest } from '../../../../test/auth';
import { POST } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const url = 'http://localhost/api/auth/login';

test('correct credentials → 200, parent session cookie set, token returned', async () => {
  const { parent, password } = await createLoginableParent(prisma);
  const res = await POST(webRequest(url, { body: { email: parent.email, password } }));
  assert.equal(res.status, 200);
  assert.ok(res.cookies.get(PARENT_SESSION_COOKIE)?.value); // httpOnly session cookie issued
  assert.equal(res.cookies.get(ADMIN_SESSION_COOKIE)?.value, undefined); // NOT the admin cookie
  const body = await res.json();
  assert.ok(body.token);
});

test('wrong password → 401, no cookie', async () => {
  const { parent } = await createLoginableParent(prisma);
  const res = await POST(webRequest(url, { body: { email: parent.email, password: 'wrong' } }));
  assert.equal(res.status, 401);
  assert.equal(res.cookies.get(PARENT_SESSION_COOKIE)?.value, undefined);
});

test('unconfirmed account with correct password → 403 email_not_confirmed', async () => {
  const { parent, password } = await createLoginableParent(prisma, { confirmed: false });
  const res = await POST(webRequest(url, { body: { email: parent.email, password } }));
  assert.equal(res.status, 403);
});

test('an admin logs in on the admin cookie surface', async () => {
  const { parent, password } = await createLoginableParent(prisma, { role: 'admin' });
  const res = await POST(webRequest(url, { body: { email: parent.email, password } }));
  assert.equal(res.status, 200);
  assert.ok(res.cookies.get(ADMIN_SESSION_COOKIE)?.value); // admins get gabee_admin_session
});

test('rate limit: repeated failures from ONE ip eventually 429', async () => {
  const { parent } = await createLoginableParent(prisma);
  const ip = '203.0.113.7'; // fixed IP → same bucket
  let sawLimit = false;
  for (let i = 0; i < 8; i++) {
    const res = await POST(webRequest(url, { ip, body: { email: parent.email, password: 'wrong' } }));
    if (res.status === 429) { sawLimit = true; break; }
  }
  assert.ok(sawLimit, 'expected a 429 within 8 attempts from one IP (limit is 5/5min)');
});
```

(Read `login/route.ts` for: the handler's second-arg shape; the exact response-body field for the token (`token` per research — align if different); how cookies are attached (`NextResponse.cookies.set` → readable via `res.cookies.get`). If the cookie isn't visible via `res.cookies`, fall back to parsing the `set-cookie` header: `res.headers.getSetCookie().some((c) => c.startsWith(PARENT_SESSION_COOKIE + '='))`. The 429 test relies on the fixed-IP bucket — every OTHER test uses the helper's default random IP so they never contribute to this bucket.)

- [ ] **Step 2: Run** — `pnpm --filter @gabee/web run test:integration` → all pass. The 429 test is the ONE that intentionally exhausts a bucket; if the limit threshold differs from research (5/5min), widen the loop bound, never weaken the "eventually 429" assertion.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/auth/login/route.integration.test.ts
git commit -m "test(web/auth): login contract — cookie surface by role, 401/403 gates, rate-limit 429"
```

---

### Task 4: Password-reset integration (consume retires old credential, re-login works)

**Files:**
- Test: `apps/web/src/lib/server/services/password-reset.integration.test.ts`

**Interfaces:**
- Consumes: `consumePasswordReset` from `@/lib/server/services/password-reset`; `login` from `@/lib/server/services/accounts`; Task-1 `createLoginableParent`/`seedPasswordReset`.
- Produces: nothing downstream.

- [ ] **Step 1: Write the test** — `password-reset.integration.test.ts`:

```ts
import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent, seedPasswordReset } from '../../../test/factories';
import { consumePasswordReset } from './password-reset';
import { login } from './accounts';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('consuming a reset retires the old credential and the new password logs in', async () => {
  const { parent, password: oldPassword } = await createLoginableParent(prisma);
  const { rawToken } = await seedPasswordReset(prisma, parent.id);

  await consumePasswordReset(rawToken, 'brand-new-password');

  await assert.rejects(() => login(parent.email, oldPassword), /invalid_credentials/); // old password dead
  const logged = await login(parent.email, 'brand-new-password'); // new one works
  assert.equal(logged.id, parent.id);

  // exactly one active (non-retired) credential remains
  const active = await prisma.parentCredential.count({ where: { parentId: parent.id, retiredAt: null } });
  assert.equal(active, 1);
});

test('a reset token is single-use', async () => {
  const { parent } = await createLoginableParent(prisma);
  const { rawToken } = await seedPasswordReset(prisma, parent.id);
  await consumePasswordReset(rawToken, 'first-new-password');
  await assert.rejects(() => consumePasswordReset(rawToken, 'second-new-password'));
});

test('an expired reset token is refused', async () => {
  const { parent } = await createLoginableParent(prisma);
  const { rawToken } = await seedPasswordReset(prisma, parent.id, { expiresAt: new Date(Date.now() - 1000) });
  await assert.rejects(() => consumePasswordReset(rawToken, 'whatever-new-password'));
});
```

(Confirm `consumePasswordReset(token, newPassword)` arg order and error strings from `password-reset.ts`; the `invalid_credentials`/single-use/expiry behaviors are the contract.)

- [ ] **Step 2: Run** — `pnpm --filter @gabee/web run test:integration` → all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/server/services/password-reset.integration.test.ts
git commit -m "test(web/auth): password-reset consume retires credential, new password logs in, single-use + expiry"
```

---

### Task 5: Device pairing integration (claim, claim-code, revoke)

**Files:**
- Test: `apps/web/src/lib/server/services/devices.integration.test.ts`

**Interfaces:**
- Consumes: `createPairToken`, `claimPairToken`, `claimByCode`, `listDevices`, `revokeDevice` from `@/lib/server/services/devices`; Task-1 `createLoginableParent`; `HttpError`.
- Produces: nothing downstream.

- [ ] **Step 1: Write the test** — `devices.integration.test.ts`. Drive the pairing at the SERVICE level (the claim flow's auth is JWT-in-body / parentId args, cleaner than the route wrappers here):

```ts
import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../test/factories';
import { createPairToken, claimPairToken, claimByCode, listDevices, revokeDevice } from './devices';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('pair-link claim creates a DeviceLink and is single-use (replay → 4xx)', async () => {
  const { parent } = await createLoginableParent(prisma);
  const { pair_url } = await createPairToken({ parentId: parent.id, label: 'iPad' });
  const token = new URL(pair_url).searchParams.get('pair')!; // token carried as ?pair=<jwt>

  const claimed = await claimPairToken({ token });
  assert.ok(claimed.token); // device bearer minted
  const links = await listDevices(parent.id);
  assert.equal(links.length, 1);

  await assert.rejects(() => claimPairToken({ token }), (e: unknown) => e instanceof HttpError && e.status >= 400);
});

test('claim-by-code binds to the owning parent; a stranger parent + same code → 404', async () => {
  const { parent } = await createLoginableParent(prisma);
  const stranger = await createLoginableParent(prisma);
  const { short_code } = await createPairToken({ parentId: parent.id, label: 'Tablet' });

  await assert.rejects(
    () => claimByCode({ parentId: stranger.parent.id, rawCode: short_code }),
    (e: unknown) => e instanceof HttpError && e.status === 404,
  );
  const ok = await claimByCode({ parentId: parent.id, rawCode: short_code });
  assert.ok(ok.token);
});

test('claim-by-code with a malformed code → 400', async () => {
  const { parent } = await createLoginableParent(prisma);
  await assert.rejects(
    () => claimByCode({ parentId: parent.id, rawCode: 'nope' }),
    (e: unknown) => e instanceof HttpError && e.status === 400,
  );
});

test('revoke removes a device from the active list and is owner-gated', async () => {
  const { parent } = await createLoginableParent(prisma);
  const stranger = await createLoginableParent(prisma);
  const { pair_url } = await createPairToken({ parentId: parent.id, label: 'Phone' });
  const token = new URL(pair_url).searchParams.get('pair')!;
  const claimed = await claimPairToken({ token });
  const deviceId = (await listDevices(parent.id))[0]!.id;

  await assert.rejects(
    () => revokeDevice(stranger.parent.id, deviceId),
    (e: unknown) => e instanceof HttpError && e.status === 403,
  );
  await revokeDevice(parent.id, deviceId);
  assert.equal((await listDevices(parent.id)).length, 0);
});
```

(Verify against `devices.ts`: the `pair_url` query-param name (research: `?pair=<jwt>`); `createPairToken` requires `label` and optional `targetEmail` (omit email → no send, returns url+code); `claimByCode` arg shape `{ parentId, rawCode }`; `revokeDevice(parentId, deviceId)` arg order and the 403/404 codes; `listDevices` returns objects with `.id`. Align to real signatures — the create→claim→revoke behaviors and status codes are the contract. The pairing rate limit (`claimByCode` 5/10min per parent) is per-parent and won't trip across these few calls; do not add a rate-limit case here.)

- [ ] **Step 2: Run** — `pnpm --filter @gabee/web run test:integration` → all pass. Assertion failures against the real service = product bug: STOP and report.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/server/services/devices.integration.test.ts
git commit -m "test(web/devices): pair-link claim + short-code ownership + revoke owner-gating against real Postgres"
```

---

### Task 6: Admin auth boundary (route-level, cookie surface)

**Files:**
- Test: `apps/web/src/app/api/admin/users/route.integration.test.ts` (or the simplest existing admin route — see Step 1)

**Interfaces:**
- Consumes: an existing admin route's `GET`/`POST` (pick a plain `requireAdmin` route); Task-1 `createLoginableParent`/`parentToken`/`webRequest`/`adminCookie`/`parentCookie`.
- Produces: the admin-cookie-auth assertion pattern for phases 4-5.

- [ ] **Step 1: Pick the route + read its handler.** From research, admin routes live under `apps/web/src/app/api/admin/**` and use `requireAdmin`/`requireSuperAdmin` (http.ts). Pick the SIMPLEST read-only `requireAdmin` route (e.g. `GET /api/admin/users` if it exists, else another admin GET) — read its `route.ts` to get the exact export (`GET`/`POST`), handler signature, and what a success returns. Use that route throughout this test. Mint tokens with `parentToken(parentId, email)` (a raw session JWT — valid for any surface since verification only checks signature + `sub`), and place it under the correct cookie NAME to exercise the boundary.

- [ ] **Step 2: Write the test** (adapt the route/verb to Step 1's choice):

```ts
import '../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../../test/factories';
import { parentToken, webRequest, adminCookie, parentCookie } from '../../../../test/auth';
import { GET } from './route'; // ← align to the chosen route's actual export/verb

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const url = 'http://localhost/api/admin/users'; // ← the chosen route

test('no session → 401', async () => {
  const res = await GET(webRequest(url, { method: 'GET' }));
  assert.equal(res.status, 401);
});

test('a plain parent (even on the admin cookie) → 403 forbidden', async () => {
  const { parent } = await createLoginableParent(prisma); // role: 'parent'
  const token = await parentToken(parent.id, parent.email);
  const res = await GET(webRequest(url, { method: 'GET', cookie: adminCookie(token) }));
  assert.equal(res.status, 403); // requireAdmin re-reads role from DB → not admin
});

test('an admin on the admin cookie → 200', async () => {
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  const token = await parentToken(parent.id, parent.email);
  const res = await GET(webRequest(url, { method: 'GET', cookie: adminCookie(token) }));
  assert.equal(res.status, 200);
});

test('an admin on the PARENT cookie is not admitted to an admin route', async () => {
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  const token = await parentToken(parent.id, parent.email);
  const res = await GET(webRequest(url, { method: 'GET', cookie: parentCookie(token) }));
  assert.ok(res.status === 401 || res.status === 403); // admin routes read the admin surface
});
```

(The last case's exact code depends on whether `requireAdmin` reads only the admin cookie surface or any session; read `getSession`/`requireAdmin` to set the precise expectation — if `requireAdmin` accepts any valid session then re-checks role, an admin on the parent cookie would 200 and this case should assert 200 instead. Determine the real behavior from the code and assert THAT; the meaningful contract is "parent role is refused, admin role is admitted on its surface." If no zero-arg `requireAdmin` GET route exists, use the simplest admin route and satisfy its body/params.)

- [ ] **Step 3: Run** — `pnpm --filter @gabee/web run test:integration` → all integration files pass serially.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/admin/users/route.integration.test.ts
git commit -m "test(web/admin): requireAdmin boundary — 401 anon, 403 parent, 200 admin, cookie-surface split"
```

---

### Task 7: Full pipeline + PR

- [ ] **Step 1: Full local pipeline**

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration
```
Expected: everything green (web integration grew by ~6 files; unit count unchanged). Lint may keep its pre-existing warnings; any FAILURE = STOP and report.

- [ ] **Step 2: Push and PR**

```bash
git push -u origin feature/test-auth-pairing
gh pr create --base main --title "test(auth-pairing): phase 3a — auth + device-pairing integration" --body "Implements phase 3a of docs/superpowers/specs/2026-07-14-test-strategy-design.md (auth & pairing, integration layer).

- new test helpers (apps/web/src/test): createLoginableParent (real scrypt credential + confirmation), seedEmailConfirmation/seedPasswordReset (known-token rows — the DB only stores sha256, so a usable token must be seeded), general webRequest builder with per-request unique IP (in-memory rate limiter never bleeds across tests)
- signup + email confirmation: scrypt hashing, email_taken, consume/expiry/replay
- login: cookie surface by role (parent vs admin), 401 wrong-password, 403 unconfirmed, 429 rate limit
- password reset: consume retires old credential + new password logs in, single-use, expiry
- device pairing: pair-link claim single-use, short-code ownership (stranger → 404), revoke owner-gating
- admin boundary: requireAdmin 401/403/200 across the parent/admin cookie surfaces

Zero production code changes. Phase 3b (parent + admin Playwright e2e) is planned next."
```

- [ ] **Step 3: Watch CI to green** — `gh run list --branch feature/test-auth-pairing --limit 1`, then `gh run watch <id> --exit-status`. Both `check` and `e2e` jobs must pass (e2e is unaffected but required). Iterate on failures; never fire-and-forget.

---

## Self-Review (done at plan-writing time)

- **Spec coverage (phase 3a):** Layer-2 auth lifecycle ✔ (Tasks 2-4 — signup/scrypt/confirmation/reset token lifecycle), Layer-2 pairing ✔ (Task 5 — pair + claim-code flows), Layer-3 route contracts + parent/admin cookie boundary ✔ (Tasks 3, 6 — status codes, cookies, rate limit). E2e for parent/admin deliberately deferred to plan 3b (scope split declared in Architecture). Middleware/CORS effects stay in e2e per the spec.
- **Placeholders:** none — every step carries runnable code/commands. Adjustment points each name the file to read (hash algorithm, route handler signatures, `pair_url` param name, admin route choice) and pin the assertions as the contract.
- **Type consistency:** `createLoginableParent`/`seedEmailConfirmation`/`seedPasswordReset`/`webRequest` signatures are defined in Task 1 and consumed unchanged in Tasks 2-6; cookie-name imports (`PARENT_SESSION_COOKIE`/`ADMIN_SESSION_COOKIE`) used consistently; `HttpError` status-code assertions match research.
- **Known risk register:** (1) token hash algorithm must match the service byte-for-byte — Task 1 Step 2 verifies before implementing; (2) in-memory rate-limiter cross-test bleed — mitigated by per-request unique IP, with a fixed-IP exhaustion test isolated in Task 3; (3) `createParent` override type may reject nested `credentials.create` — Task 1 Step 3 gives the two-call fallback; (4) cookie visibility via `res.cookies` vs `set-cookie` header — Task 3 Step 1 gives the fallback; (5) admin route selection — Task 6 Step 1 reads the real route before asserting.
