# Parent & Admin E2E (Phase 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the parent and admin Playwright projects (spec Layer 4) and the two remaining e2e scenarios — parent signup → email confirmation → dashboard → password change (+ classify a session), and admin login → healthy-use → users → content — completing phase 3.

**Architecture:** Phase 3b of `docs/superpowers/specs/2026-07-14-test-strategy-design.md`, the e2e half of "auth & pairing" (3a = integration, merged PR #13). Reuses the existing `e2e/` workspace (built apps via `webServer`, `global-setup.ts` seeding, `helpers/db.ts`). Adds two Playwright **projects** (`parent`, `admin`) pointed at the web app (`http://localhost:3000`) alongside the existing `kid` project — the shared `webServer` already starts both servers, so no server or CI change is needed. New scenarios drive the real built Next app; email-confirmation tokens are seeded as known-token rows (the DB stores only `sha256`), and an admin fixture is minted by promoting a seeded tester in global-setup.

**Tech Stack:** Playwright (`@playwright/test`, chromium), the `e2e/` prisma client (`createTestClient` from `@gabee/db/testing`) for seeding/assertions, `createChild` factory, French UI selectors.

## Global Constraints

- **Never add `Co-Authored-By`/AI-attribution trailers to commits or PR bodies** (user rule).
- **Zero production (app runtime) code changes.** Edits are confined to `e2e/` and `packages/db/prisma/seed-fixtures.ts`/test infra. If a flow can't be driven without a production change, STOP and report — do not add `data-testid`s or alter app code.
- **The web app renders in FRENCH by default** (`/parent/*` and `/admin/*` bypass next-intl; no locale prefix; `parent_lang`/`admin_lang` cookie defaults to `fr`). ALL selectors use the French strings verified in this plan. Do not switch to English.
- **Login is rate-limited 5 requests / 5 min per client IP** (`/api/auth/login`), and every browser login originates from `127.0.0.1`. To stop specs tripping each other: each new project sets a **distinct `x-forwarded-for`** via `use.extraHTTPHeaders` (the app reads the first hop as the client IP), giving `parent` and `admin` separate rate-limit buckets from `kid` and from each other. Keep total logins per project ≤ 4 (CI `retries: 1` can double a failed test's logins).
- **Confirmation/reset tokens: the DB stores only `sha256(rawToken)`** — the raw token lives solely in the noop email. A signup→confirm e2e cannot read the token back; it seeds an `EmailConfirmation` row with a known token's sha256, then visits `/parent/confirm-email?token=<raw>`. (`e2e/` cannot import `apps/web/src/test/factories.ts` across the workspace boundary, so this is inlined in a new `e2e/helpers/seed.ts` using `crypto` + the e2e prisma client.)
- **Email is the noop provider in tests** (no `MAILGUN_*`/`RESEND_*` env) — never assert on email delivery.
- e2e runs `workers: 1` (shared DB, seeded once by `global-setup`, NO per-test reset) — specs must not collide: use a **unique email per signup** and never mutate a fixture another spec depends on.
- Node 20, pnpm, repo root = worktree root. Branch `feature/test-parent-admin-e2e` off `origin/main`.

---

### Task 0: Branch

- [ ] **Step 1:** Worktree/branch `feature/test-parent-admin-e2e` off `origin/main` (handled by worktree tooling; verify `git status -sb`). Fresh worktrees need `packages/db/.env` + `pnpm --filter @gabee/db run db:generate` before web builds; the local `gabee_test` DB is already migrated.

---

### Task 1: Harness — parent/admin projects, admin fixture, seed helpers, web-surface smoke

**Files:**
- Modify: `e2e/playwright.config.ts` (add `parent` + `admin` projects with `baseURL: WEB_URL` + per-project `x-forwarded-for`)
- Modify: `e2e/global-setup.ts` (promote `tester2` → `super_admin` after fixtures)
- Modify: `e2e/helpers/db.ts` (add `FIXTURES.adminEmail`/`adminPassword`, keep existing)
- Create: `e2e/helpers/seed.ts` (`seedEmailConfirmation`, `seedPendingClassification`)
- Test: `e2e/tests/web-surface.spec.ts` (smoke: `/parent/login` + `/admin/login` render; runs under the `parent` project)

**Interfaces:**
- Consumes: `prisma` from `helpers/db.ts`; `createChild` from `@gabee/db/testing`; `WEB_URL` from `playwright.config.ts`.
- Produces (used by Tasks 2-4): the `parent`/`admin` projects; `FIXTURES.adminEmail = 'tester2@staging.gabee.app'` (super_admin), `FIXTURES.adminPassword = 'staging-pass'`; `seedEmailConfirmation(parentId, opts?) → { rawToken }`; `seedPendingClassification({ parentId }) → { childId, sessionId }`.

- [ ] **Step 1: Add the projects** — in `e2e/playwright.config.ts`, replace the single-project array with (keep `kid` exactly as-is, only add two):

```ts
projects: [
  { name: 'kid', use: { ...devices['Desktop Chrome'] } }, // inherits top-level baseURL: KID_URL
  {
    name: 'parent',
    use: { ...devices['Desktop Chrome'], baseURL: WEB_URL, extraHTTPHeaders: { 'x-forwarded-for': '10.20.0.1' } },
  },
  {
    name: 'admin',
    use: { ...devices['Desktop Chrome'], baseURL: WEB_URL, extraHTTPHeaders: { 'x-forwarded-for': '10.20.0.2' } },
  },
],
```

(The distinct IPs isolate each project's login rate-limit bucket. `WEB_URL` is already exported from this file. No `webServer`/`globalSetup` change — both are config-level and already start/seed everything.)

- [ ] **Step 2: Mint the admin fixture** — in `e2e/global-setup.ts`, after the `seed-fixtures.ts` run step, promote tester2 to super_admin (idempotent — fixtures upsert tester2 first each run):

```ts
// tester2 is a plain parent fixture; promote it so the admin project has a super_admin session.
const promote = createTestClient();
await promote.parentAccount.update({
  where: { email: 'tester2@staging.gabee.app' },
  data: { role: 'super_admin' },
});
await promote.$disconnect();
```

(`createTestClient` is already imported in global-setup. super_admin — not plain admin — because the admin scenario exercises the healthy-use SAVE and the super_admin-gated surfaces.)

- [ ] **Step 3: Extend FIXTURES** — in `e2e/helpers/db.ts`, add to the `FIXTURES` object (keep existing fields):

```ts
adminEmail: 'tester2@staging.gabee.app',
adminPassword: 'staging-pass',
```

- [ ] **Step 4: Seed helpers** — create `e2e/helpers/seed.ts`:

```ts
import { randomUUID, createHash } from 'node:crypto';
import { createChild } from '@gabee/db/testing';
import { prisma } from './db';

/** Seed an EmailConfirmation row for a known raw token (DB stores only the sha256). */
export async function seedEmailConfirmation(
  parentId: string,
  opts: { expiresAt?: Date } = {},
): Promise<{ rawToken: string }> {
  const rawToken = randomUUID() + randomUUID(); // ≥20 chars, matches the route's z.string().min(20)
  await prisma.emailConfirmation.create({
    data: {
      parentId,
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      consumedAt: null,
    },
  });
  return { rawToken };
}

/** Seed a child + one PENDING (label: null) session classification under a parent. */
export async function seedPendingClassification(args: {
  parentId: string;
}): Promise<{ childId: string; sessionId: string }> {
  const child = await createChild(prisma, { parentId: args.parentId });
  const sessionId = randomUUID();
  await prisma.sessionClassification.create({
    data: {
      profileId: child.id,
      sessionId,
      startedAt: new Date(),
      label: null, // null = pending, what listPending filters on
    },
  });
  return { childId: child.id, sessionId };
}
```

(Before implementing, read `packages/db/prisma/schema.prisma` for `EmailConfirmation` (~line 212) and `SessionClassification` (~line 439) to confirm the exact required column names/types — align the `data` objects if any required field is missing (e.g. `SessionClassification` may require `firstModule` or another non-defaulted column). The sha256 algorithm must match `email-confirmation.ts`'s `hash()` — phase 3a verified it is `createHash('sha256').update(token).digest('hex')`.)

- [ ] **Step 5: Web-surface smoke** — `e2e/tests/web-surface.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('parent login page renders (French)', async ({ page }) => {
  await page.goto('/parent/login');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await expect(page.locator('#pe')).toBeVisible(); // email input
});

test('admin login page renders (French)', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await expect(page.locator('#ae')).toBeVisible(); // admin email input
});
```

(This file runs under whichever project's `testMatch` includes it. To keep it simple, all specs live in `e2e/tests/` and every project runs every file unless filtered. Since projects differ only by baseURL/headers, `web-surface` will run under kid too and FAIL there — `page.goto('/parent/login')` resolves against the kid baseURL:5173. To avoid that, scope specs to projects: add `testMatch`/`testIgnore` per project in Step 1, OR — simpler and the chosen approach — put project-specific specs in subfolders and set each project's `testDir`. Use: `e2e/tests/parent/**` for the `parent` project, `e2e/tests/admin/**` for `admin`, and keep the existing kid/smoke specs matched by the `kid` project. Implement this by giving each project a `testMatch`, e.g. `kid: testMatch: /(smoke|kid-.*)\.spec\.ts/`, `parent: testMatch: /parent\/.*\.spec\.ts/`, `admin: testMatch: /admin\/.*\.spec\.ts/`, and place this smoke file at `e2e/tests/parent/web-surface.spec.ts`. Confirm the existing `smoke.spec.ts` + `kid-offline-sync.spec.ts` still match ONLY the kid project after you set its `testMatch`.)

- [ ] **Step 6: Run** — from the worktree root with env exported (next build needs it):

```bash
DATABASE_URL=postgresql://localhost:5432/gabee_test DIRECT_URL=postgresql://localhost:5432/gabee_test \
TEST_DATABASE_URL=postgresql://localhost:5432/gabee_test AUTH_JWT_SECRET=e2e-local-secret-32-chars-minimum-xx \
pnpm run test:e2e
```
Expected: builds run, both servers boot, global setup seeds + promotes tester2, and ALL projects pass — kid specs (smoke + offline-sync) under `kid`, the two web-surface tests under `parent`. Confirm tester2 is super_admin: the run's global-setup did the promote (no error). Also `pnpm run typecheck` + `pnpm run lint` green.

- [ ] **Step 7: Commit**

```bash
git add e2e/playwright.config.ts e2e/global-setup.ts e2e/helpers/db.ts e2e/helpers/seed.ts e2e/tests/parent/web-surface.spec.ts
git commit -m "test(e2e): parent+admin projects, super_admin fixture promotion, confirmation/classification seed helpers, web-surface smoke"
```

---

### Task 2: Parent auth e2e — signup → confirm → login → dashboard → password change

**Files:**
- Test: `e2e/tests/parent/auth-flow.spec.ts`

**Interfaces:**
- Consumes: Task-1 `parent` project, `seedEmailConfirmation`, `prisma`.
- Produces: nothing downstream.

**UI contract (verified against `app/parent/*`, French):**

| Step | Selector |
|---|---|
| Signup fields | `#pf` (Prénom), `#pl` (Nom), `#pe` (email), `#pp` (password), `#pp2` (confirm), `#pph` (phone) |
| Signup T&C | `getByRole('button', { name: /J'accepte/ })` (a button, not a checkbox) |
| Signup submit | `getByRole('button', { name: 'Créer mon compte' })` (disabled until valid) |
| Signup success | heading `Vérifie tes mails` |
| Confirm success | heading `Email confirmé !` (page auto-POSTs the token on mount) |
| Login fields/submit | `#pe`, `#pp`, `getByRole('button', { name: 'Se connecter' })` |
| Dashboard (fresh, 0 kids) | heading `Bienvenue chez Gabee !` (empty state) |
| Settings password tab | goto `/parent/settings?tab=password` |
| Password fields | `getByLabel('Mot de passe actuel')`, `getByLabel('Nouveau mot de passe')`, `getByLabel('Confirmer')` |
| Password submit | `getByRole('button', { name: 'Changer le mot de passe' })` |
| Password success | `Mot de passe changé.` (role=status banner) |

- [ ] **Step 1: Write the test** — `e2e/tests/parent/auth-flow.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../helpers/db';
import { seedEmailConfirmation } from '../../helpers/seed';

test('parent signup → confirm → login → dashboard → change password', async ({ page }) => {
  const email = `e2e-parent-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'e2ePass123';

  // ── Signup (real form) ──
  await page.goto('/parent/signup');
  await page.locator('#pf').fill('Testy');
  await page.locator('#pl').fill('Parent');
  await page.locator('#pe').fill(email);
  await page.locator('#pp').fill(password);
  await page.locator('#pp2').fill(password);
  await page.locator('#pph').fill('612345678'); // valid FR mobile national number
  await page.getByRole('button', { name: /J'accepte/ }).click();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifie tes mails' })).toBeVisible();

  // ── Confirm (seed a known token — DB only stores sha256) ──
  const parent = await prisma.parentAccount.findUniqueOrThrow({ where: { email } });
  expect(parent.emailConfirmedAt).toBeNull();
  const { rawToken } = await seedEmailConfirmation(parent.id);
  await page.goto(`/parent/confirm-email?token=${rawToken}`);
  await expect(page.getByRole('heading', { name: 'Email confirmé !' })).toBeVisible();
  const confirmed = await prisma.parentAccount.findUniqueOrThrow({ where: { id: parent.id } });
  expect(confirmed.emailConfirmedAt).not.toBeNull(); // consume really stamped it

  // ── Login ──
  await page.goto('/parent/login');
  await page.locator('#pe').fill(email);
  await page.locator('#pp').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/parent$/);
  await expect(page.getByRole('heading', { name: 'Bienvenue chez Gabee !' })).toBeVisible(); // 0-kids empty state

  // ── Change password ──
  await page.goto('/parent/settings?tab=password');
  await page.getByLabel('Mot de passe actuel').fill(password);
  await page.getByLabel('Nouveau mot de passe').fill('e2eNewPass456');
  await page.getByLabel('Confirmer').fill('e2eNewPass456');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page.getByText('Mot de passe changé.')).toBeVisible();
});
```

- [ ] **Step 2: Run and stabilize**

```bash
pnpm --filter @gabee/e2e run test -- --project=parent
```
(Builds must already exist from Task 1's `test:e2e`, and both servers running; if not, run the full `test:e2e` env-exported command from Task 1 Step 6.) Expected: PASS. The ASSERTIONS are the contract; bounded adjustments (name them in your report), each verified against source, never weakening an assertion:
- **Phone**: `612345678` must satisfy the client's `libphonenumber-js` check for the default country so the submit button enables. If the default country isn't France or the number is rejected (button stays disabled → click times out), read `app/parent/signup/page.tsx` for the default country + validation and use a valid number for it. If the phone widget proves intractable to drive, the documented fallback is to perform signup via `page.request.post('/api/auth/signup', { data: { email, password, phone: '+33612345678' } })` and assert its 201, then continue the confirm→login→settings flow through the UI (still exercises the signup route + all downstream UI). Prefer the real form; fall back only if blocked.
- **Dashboard heading**: a fresh account has 0 kids → the empty-state `Bienvenue chez Gabee !`. If the greeting differs, assert the primary nav (`getByRole('navigation', { name: 'primary' })`) visible + URL `/parent` instead.
- **Password labels**: if `getByLabel` doesn't resolve (inputs may lack `id`/`for` association — research noted no `id`), fall back to `page.locator('input[autocomplete="current-password"]')` / `input[autocomplete="new-password"]` (first = new, second = confirm), verified against `password-tab.tsx`.

Run 3× consecutively; all green.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/parent/auth-flow.spec.ts
git commit -m "test(e2e/parent): signup → seeded-token confirm → login → dashboard → password change"
```

---

### Task 3: Parent classify-a-session e2e

**Files:**
- Test: `e2e/tests/parent/classify.spec.ts`

**Interfaces:**
- Consumes: Task-1 `parent` project, `seedPendingClassification`, `prisma`, `FIXTURES` (tester1 — a confirmed plain parent).
- Produces: nothing downstream.

**UI contract (verified against `app/parent/classify/*`):** classify question heading `Cette session…` (`h1.classify-q`); choice buttons `getByRole('button', { name: 'À son initiative' })` (child_initiated), `'À votre initiative'` (prompted), `'Pas sûr·e'` (unsure); done screen heading `Tout est revu !`.

- [ ] **Step 1: Write the test** — `e2e/tests/parent/classify.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { prisma, FIXTURES } from '../../helpers/db';
import { seedPendingClassification } from '../../helpers/seed';

test('parent classifies a pending session and the queue empties', async ({ page }) => {
  const parent = await prisma.parentAccount.findUniqueOrThrow({ where: { email: FIXTURES.parentEmail } });
  const { sessionId } = await seedPendingClassification({ parentId: parent.id });

  // Login as the (confirmed) fixture parent
  await page.goto('/parent/login');
  await page.locator('#pe').fill(FIXTURES.parentEmail);
  await page.locator('#pp').fill(FIXTURES.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/parent$/);

  // Classify the one pending session
  await page.goto('/parent/classify');
  await expect(page.locator('h1.classify-q')).toBeVisible();
  await page.getByRole('button', { name: 'À son initiative' }).click();

  // Queue empties → thank-you screen, and the label is persisted
  await expect(page.getByRole('heading', { name: 'Tout est revu !' })).toBeVisible();
  const row = await prisma.sessionClassification.findUniqueOrThrow({ where: { sessionId } });
  expect(row.label).toBe('child_initiated');
});
```

(Verify against source: the `SessionClassification.label` enum value stored for "À son initiative" is `child_initiated` (from `classify-flow.tsx`'s `choose('child_initiated')` → POST body); if the persisted enum differs, align the final assertion. `tester1` must be a plain parent with ≥0 kids — seeding a child here is fine. If tester1 already has pending classifications from another spec, this still works since we assert the specific `sessionId` label; but if the classify UI shows multiple cards, click through only until the queue empties — with a freshly-reset DB per run, tester1 has exactly this one pending row. NOTE: this spec seeds a child under tester1 — ensure no other parent spec asserts tester1 has zero kids.)

- [ ] **Step 2: Run** — `pnpm --filter @gabee/e2e run test -- --project=parent` → both parent specs pass (auth-flow + classify). Run 3× for stability. Any assertion failure against real behavior = STOP and report.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/parent/classify.spec.ts
git commit -m "test(e2e/parent): classify a pending session, queue empties, label persists"
```

---

### Task 4: Admin e2e — login → dashboard → healthy-use → users → content

**Files:**
- Test: `e2e/tests/admin/admin-flow.spec.ts`

**Interfaces:**
- Consumes: Task-1 `admin` project + `FIXTURES.adminEmail`/`adminPassword` (tester2 = super_admin), `prisma`.
- Produces: nothing downstream.

**UI contract (verified against `app/admin/*`, French):** login `#ae` (email), `#ap` (password), submit `Se connecter`; dashboard heading `Tableau de bord`; healthy-use page heading `Usage sain`, save button `Enregistrer`, success `Limites enregistrées.`; users/parents heading `Parents`; content heading `Contenu` + `table.matrix`.

- [ ] **Step 1: Write the test** — `e2e/tests/admin/admin-flow.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { prisma, FIXTURES } from '../../helpers/db';

test('admin logs in and reaches dashboard, healthy-use, users, content', async ({ page }) => {
  // ── Login (super_admin fixture) ──
  await page.goto('/admin/login');
  await page.locator('#ae').fill(FIXTURES.adminEmail);
  await page.locator('#ap').fill(FIXTURES.adminPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  // ── Healthy-use: save the (unchanged, valid) limits → success banner ──
  await page.goto('/admin/healthy-use');
  await expect(page.getByRole('heading', { name: 'Usage sain' })).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Limites enregistrées.')).toBeVisible();

  // ── Users: the parents table lists a seeded fixture parent ──
  await page.goto('/admin/users/parents');
  await expect(page.getByRole('heading', { name: 'Parents' })).toBeVisible();
  await expect(page.getByText(FIXTURES.parentEmail)).toBeVisible(); // tester1 row

  // ── Content: the plan/pool matrix renders ──
  await page.goto('/admin/content');
  await expect(page.getByRole('heading', { name: 'Contenu' })).toBeVisible();
  await expect(page.locator('table.matrix')).toBeVisible();
});
```

(Verify against source: clicking `Enregistrer` with UNCHANGED valid limits still PATCHes and shows `Limites enregistrées.` — if the button is disabled without a change, tweak one triplet field keeping `min ≤ default ≤ max` (read `healthy-use-form.tsx` `TRIPLET_FIELDS`) before saving. The save button only renders for super_admin, which tester2 is. Content is VIEW-ONLY here — do NOT click Publish (all modules are already published with no pending diff after global-setup, so the button is the disabled `À jour`; a publish-click test needs a seeded pending diff and is deferred). If `table.matrix` selector differs, assert a content-matrix cell link `a.mcell` instead.)

- [ ] **Step 2: Run** — `pnpm --filter @gabee/e2e run test -- --project=admin` → passes. Run 3× for stability. Assertion failure against real behavior = STOP and report.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/admin/admin-flow.spec.ts
git commit -m "test(e2e/admin): login → dashboard → healthy-use save → users list → content matrix"
```

---

### Task 5: Full pipeline + PR

- [ ] **Step 1: Full local pipeline** (env exported for the e2e leg):

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration
DATABASE_URL=postgresql://localhost:5432/gabee_test DIRECT_URL=postgresql://localhost:5432/gabee_test \
TEST_DATABASE_URL=postgresql://localhost:5432/gabee_test AUTH_JWT_SECRET=e2e-local-secret-32-chars-minimum-xx \
pnpm run test:e2e
```
Expected: all green — `test:e2e` now runs kid + parent + admin projects (5 spec files). Lint may keep pre-existing warnings; any FAILURE = STOP and report. Because all projects run serially (`workers: 1`), note the total e2e wall-clock in your report (the CI `e2e` job has a 30-min timeout — flag if the run approaches it).

- [ ] **Step 2: Push and PR**

```bash
git push -u origin feature/test-parent-admin-e2e
gh pr create --base main --title "test(e2e): phase 3b — parent + admin e2e (auth, classify, admin surfaces)" --body "Completes phase 3 of docs/superpowers/specs/2026-07-14-test-strategy-design.md (auth & pairing) — the e2e half.

- adds parent + admin Playwright projects (baseURL :3000, distinct x-forwarded-for per project so the 5/5min login rate-limit buckets don't bleed); kid project unchanged; no webServer/CI change needed
- global-setup promotes tester2 → super_admin; new e2e/helpers/seed.ts (seedEmailConfirmation — DB stores only sha256, so a usable token is seeded; seedPendingClassification)
- parent: signup (real form) → seeded-token email confirmation → login → dashboard → password change; and classify a pending session (queue empties, label persists)
- admin: login → dashboard → healthy-use save → users list → content matrix (view-only; publish-click deferred, needs a seeded pending diff)

Zero production runtime changes. This closes phase 3; phase 4 (sessions & progression) is next."
```

- [ ] **Step 3: Watch CI to green** — `gh run list --branch feature/test-parent-admin-e2e --limit 1`, then `gh run watch <id> --exit-status`. Both `check` and `e2e` jobs must pass. Iterate on failures; never fire-and-forget.

---

## Self-Review (done at plan-writing time)

- **Spec coverage (phase 3b):** parent scenario ✔ (Tasks 2-3 — signup → email confirmation [token seeded, since DB stores only sha256] → dashboard → classify → settings/password change), admin scenario ✔ (Task 4 — login → healthy-use → users → content). Content publish-CLICK deliberately deferred (needs a seeded pending diff; view-only asserts the matrix) — declared in the plan and PR body. Middleware/CORS header assertions from the spec's Layer-3 note are not in 3b scope (a future hardening).
- **Placeholders:** none — every step has runnable code/commands. Adjustment points each name the file to read (phone validation/default country, dashboard heading, password label association, classify enum value, healthy-use save-without-change) and pin the assertions as the contract.
- **Type consistency:** `seedEmailConfirmation`/`seedPendingClassification`/`FIXTURES.adminEmail` defined in Task 1, consumed unchanged in Tasks 2-4; project names (`parent`/`admin`) and their `testMatch` folders (`tests/parent/**`, `tests/admin/**`) consistent; `WEB_URL` reused from config.
- **Known risk register:** (1) login rate-limit bleed — mitigated by per-project `x-forwarded-for` + ≤4 logins/project; (2) signup phone widget — bounded fallback to `page.request.post('/api/auth/signup')`; (3) project/testMatch scoping so parent/admin specs don't run against the kid baseURL — Task 1 Step 5 sets `testMatch` per project and re-verifies kid specs still match only kid; (4) confirmation token unreadable — seeded known-token row; (5) admin fixture absent — promoted in global-setup; (6) serial e2e runtime vs the 30-min CI cap — measured and flagged in Task 5.
