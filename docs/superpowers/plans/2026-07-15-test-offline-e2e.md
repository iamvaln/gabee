# Offline E2E (Phase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the repo-root Playwright `e2e/` workspace (spec Layer 4) and land the kid offline e2e scenario: play a full session offline, reconnect, and prove every queued event row lands in Postgres.

**Architecture:** Phase 2b of `docs/superpowers/specs/2026-07-14-test-strategy-design.md` — the second half of phase 2 (2a = unit + integration, merged as PR #7). New `e2e/` pnpm workspace with Playwright driving BUILT apps (`next start` :3000 + `vite preview` :5173) via `webServer`, a global-setup that resets `gabee_test` and seeds content (`db:seed` → `publish.mts` — bundles serve only `confirmed` questions, seed data is all `candidate`) plus login fixtures (`seed-fixtures.ts`), and one spec: online warm-up session (caches the numbers bundle in Dexie) → `context.setOffline(true)` → full offline session → reconnect → poll Postgres for every queued `event_id`. Only the kid project exists in this phase; parent/admin projects and Lighthouse come in later phases (3, 5, 6).

**Tech Stack:** Playwright (`@playwright/test`, chromium only), `@gabee/db/testing` (`createTestClient`, `resetDb`) for DB assertions, existing seed tooling (`prisma/seed.ts`, `prisma/publish.mts`, `prisma/seed-fixtures.ts`), GitHub Actions `e2e` job parallel to `check`.

## Global Constraints

- **Never add `Co-Authored-By`/AI-attribution trailers to commits or PR bodies** (user rule).
- **Zero production code changes.** The kid app has no `data-testid`s; all selectors use existing role/text/aria/`data-module` hooks. If a flow can't be driven without a production change, STOP and report — don't add hooks silently.
- Spec Layer 4 verbatim: runs against **built** apps (`vite preview` for kid, `next start` for web) + migrated & seeded test Postgres, via Playwright `webServer`; offline via `context.setOffline(true)`; artifacts on failure = trace + video, uploaded from CI.
- **The kid app renders in FRENCH by default** (`i18n.ts` `lng: 'fr'`, store default `lang: 'fr'`). All UI selectors in this plan use the French strings — do not "fix" them to English.
- Any DB URL used by config, global-setup, or CI must point at a database whose name ends in `_test` (guard with an explicit check, same policy as `resetDb`).
- `workers: 1` — one shared DB and a stateful kid flow; never parallelize this suite.
- e2e stays OUT of lefthook pre-push (repo convention, stated in `lefthook.yml`) and out of the turbo `test`/`test:integration` graphs. CI runs it as a separate parallel job.
- `next build`/`next start` run with `NODE_ENV=production`, where `env.ts` **requires `AUTH_JWT_SECRET`** (only prod-required var; everything else has defaults). Provide a dummy e2e secret via env — never a real one, never in a tracked `.env.*.example`.
- Node 20, pnpm, repo root = worktree root. Branch `feature/test-offline-e2e` off `origin/main`.

---

### Task 0: Branch

- [ ] **Step 1:** Worktree/branch `feature/test-offline-e2e` off `origin/main` (handled by worktree tooling; verify `git status -sb` and `git merge-base --is-ancestor origin/main HEAD`). Fresh worktrees need `packages/db/.env` + `pnpm --filter @gabee/db run db:generate` before web builds.

---

### Task 1: `e2e/` workspace bootstrap + smoke test

**Files:**
- Modify: `pnpm-workspace.yaml` (add `e2e` to `packages`)
- Modify: `turbo.json` (add `AUTH_JWT_SECRET` to the `build` task's `passThroughEnv` — turbo strict env mode would otherwise hide it from `next build`)
- Modify: root `package.json` (add `test:e2e` script)
- Modify: root `.gitignore` (Playwright artifacts)
- Create: `e2e/package.json`, `e2e/tsconfig.json`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/helpers/db.ts`
- Test: `e2e/tests/smoke.spec.ts`

**Interfaces:**
- Consumes: `@gabee/db/testing` (`createTestClient()` — reads `TEST_DATABASE_URL`; `resetDb(prisma)` — truncates, refuses non-`_test` DBs), seed scripts in `packages/db/prisma/` (`seed.ts` via `db:seed`, `publish.mts`, `seed-fixtures.ts` gated by `STAGING_FIXTURES=1`), `GET /api/health` on the web app.
- Produces: `FIXTURES` (`{ parentEmail: 'tester1@staging.gabee.app', password: 'staging-pass', childName: 'Ava' }`), `prisma` client and `pollUntil(fn, pred, opts?)` from `e2e/helpers/db.ts`, ports 3000 (web) / 5173 (kid preview), the `pnpm run test:e2e` entry point — all reused verbatim by Task 2.

- [ ] **Step 1: Workspace + package scaffolding**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "e2e"
```

`e2e/package.json`:

```json
{
  "name": "@gabee/e2e",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test"
  },
  "dependencies": {
    "@gabee/db": "workspace:*"
  }
}
```

Then from the repo root: `pnpm --filter @gabee/e2e add -D @playwright/test` (installs the current latest 1.x; pin whatever it resolves) and `pnpm --filter @gabee/e2e exec playwright install chromium`.

`e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
```

Root `.gitignore` — append:

```
e2e/test-results/
e2e/playwright-report/
```

Root `package.json` — add script (builds both apps first; `webServer` only *starts* them):

```json
"test:e2e": "turbo run build && pnpm --filter @gabee/e2e run test"
```

`turbo.json` — in the top-level `build` task, extend `passThroughEnv` to `["DATABASE_URL", "DIRECT_URL", "AUTH_JWT_SECRET"]` (leave everything else as-is).

- [ ] **Step 2: Playwright config**

`e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export const WEB_URL = 'http://localhost:3000';
export const KID_URL = 'http://localhost:5173';

// Local default matches packages/db's db:migrate:test fallback (brew Postgres, trust auth).
// CI overrides via TEST_DATABASE_URL. Guard: e2e must never point at a non-test DB.
export const DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/gabee_test';
if (!DB_URL.includes('_test')) {
  throw new Error(`Refusing e2e against non-test database: ${DB_URL}`);
}
// next start runs NODE_ENV=production, which hard-requires AUTH_JWT_SECRET (env.ts).
const JWT_SECRET = process.env.AUTH_JWT_SECRET ?? 'e2e-only-jwt-secret-not-for-production';

// Workers and helpers (helpers/db.ts createTestClient) inherit these.
process.env.TEST_DATABASE_URL ??= DB_URL;
process.env.AUTH_JWT_SECRET ??= JWT_SECRET;

export default defineConfig({
  testDir: './tests',
  timeout: 180_000, // one test walks two full 7-question sessions
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1, // shared DB + stateful kid flow — never parallelize
  globalSetup: './global-setup.ts',
  use: {
    baseURL: KID_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'kid', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @gabee/web run start',
      url: `${WEB_URL}/api/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: DB_URL,
        DIRECT_URL: DB_URL,
        AUTH_JWT_SECRET: JWT_SECRET,
        KID_APP_ORIGIN: KID_URL, // CORS allow-origin for the kid app (env.ts default is the same value; explicit > implicit)
      },
    },
    {
      command: 'pnpm --filter @gabee/kid run preview -- --port 5173 --strictPort',
      url: KID_URL,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

Note: `vite preview` defaults to port 4173 — the `--port 5173 --strictPort` flags are load-bearing (the web app's CORS pins `Access-Control-Allow-Origin` to `KID_APP_ORIGIN`, default `http://localhost:5173`, and the kid build's API base defaults to `http://localhost:3000`).

- [ ] **Step 3: Global setup (DB reset + seed + publish + fixtures)**

`e2e/global-setup.ts`:

```ts
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { DB_URL } from './playwright.config';

const ROOT = path.resolve(__dirname, '..');

function run(cmd: string, extraEnv: Record<string, string> = {}): void {
  execSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      DIRECT_URL: DB_URL,
      TEST_DATABASE_URL: DB_URL,
      ...extraEnv,
    },
  });
}

export default async function globalSetup(): Promise<void> {
  // Clean slate (resetDb re-verifies the live DB name ends in _test).
  const prisma = createTestClient();
  await resetDb(prisma);
  await prisma.$disconnect();

  // Content: sub-modes, curriculum, question pools (all status=candidate)...
  run('pnpm --filter @gabee/db run db:seed');
  // ...then confirm+publish so /api/bundles serves them (bundles filter status=confirmed).
  run('pnpm --filter @gabee/db exec tsx prisma/publish.mts');
  // Login fixtures: tester1/tester2 parents (password "staging-pass") + children Ava/Noah/Mia.
  run('pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts', { STAGING_FIXTURES: '1' });
}
```

(If Playwright's TS transform rejects `__dirname` under `"type": "module"`, switch to `const ROOT = path.resolve(process.cwd(), '..')` — Playwright's cwd is the `e2e/` dir when invoked via the package script; note which variant you used in your report.)

- [ ] **Step 4: DB helpers**

`e2e/helpers/db.ts`:

```ts
import { createTestClient } from '@gabee/db/testing';

/** Shared client for test-side DB assertions (TEST_DATABASE_URL is set by playwright.config.ts). */
export const prisma = createTestClient();

export const FIXTURES = {
  parentEmail: 'tester1@staging.gabee.app', // seed-fixtures.ts
  password: 'staging-pass',
  childName: 'Ava',
} as const;

/** Poll `fn` until `pred` accepts its value; throws with the last value on timeout. */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  pred: (value: T) => boolean,
  { timeoutMs = 30_000, intervalMs = 500 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await fn();
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  } while (Date.now() < deadline);
  throw new Error(`pollUntil timed out after ${timeoutMs}ms; last value: ${JSON.stringify(last)}`);
}
```

- [ ] **Step 5: Write the smoke test**

`e2e/tests/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { WEB_URL } from '../playwright.config';
import { prisma, FIXTURES } from '../helpers/db';

test('servers are up, DB is seeded, kid app shows the login screen', async ({ page }) => {
  const health = await page.request.get(`${WEB_URL}/api/health`);
  expect(health.ok()).toBeTruthy();

  // Global setup seeded fixtures + published content.
  const parent = await prisma.parentAccount.findUnique({ where: { email: FIXTURES.parentEmail } });
  expect(parent).not.toBeNull();
  expect(await prisma.question.count({ where: { module: 'numbers', status: 'confirmed' } })).toBeGreaterThan(0);

  // Kid app boots to the (French) login screen.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demande à un adulte' })).toBeVisible();
  await expect(page.getByPlaceholder('Adresse e-mail')).toBeVisible();
});
```

(If the `question` model/field names differ, check `packages/db/prisma/schema.prisma` and align the query — the assertion "seeded numbers content is confirmed" is the contract.)

- [ ] **Step 6: RED then GREEN**

Run `pnpm --filter @gabee/e2e run test` BEFORE building the apps: expected failure — webServer can't start (`next start` with no `.next` build / preview with no `dist`). That failure proves the config actually drives built apps. Then:

```bash
pnpm run test:e2e
```

Expected: builds run (turbo), both servers boot, global setup seeds, smoke test passes 1/1. Then confirm nothing else broke: `pnpm run test` (unit suites untouched) and `pnpm run lint`.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml turbo.json package.json .gitignore pnpm-lock.yaml e2e/
git commit -m "test(e2e): playwright bootstrap — e2e workspace, built-app webServer, seeded gabee_test, smoke"
```

---

### Task 2: Kid offline sync e2e scenario

**Files:**
- Test: `e2e/tests/kid-offline-sync.spec.ts`

**Interfaces:**
- Consumes: Task 1's `prisma`, `pollUntil`, `FIXTURES` (`e2e/helpers/db.ts`); the running kid/web servers; Prisma models `event` (`eventId`, `profileId`), `childProfile` (`totalStars`).
- Produces: the completed phase-2 spec deliverable (kid offline e2e). Nothing downstream.

**UI contract (verified against the current kid app source — selectors are French, see Global Constraints):**

| Screen | Action | Selector |
|---|---|---|
| Login | fill email/password | `getByPlaceholder('Adresse e-mail')` / `getByPlaceholder('Mot de passe')` |
| Login | submit | `getByRole('button', { name: 'Se connecter' })` |
| Device-link gate (always shown after plain login) | skip | `getByRole('button', { name: /Plus tard/ })` ("Plus tard — juste jouer cette fois") |
| ProfileSelect | pick child | `getByRole('button', { name: 'Ava' })` (accessible name = child name) |
| Hub | open module | `locator('button.module-tile[data-module="numbers"]')` |
| NumbersHub | start session (auto-starts next lesson; 2 clicks hub→question) | `getByRole('button', { name: /Nombres & comptage/ })` |
| Session | answer options | `locator('.session-answers .answer-btn')` (accessible name = displayed value) |
| Session | feedback button (per pick) | `locator('.feedback-strip .btn')` — text "Suivant" (correct) or "Réessayer" (wrong; same question replays with the same option order) |
| Summary | milestone dialog (first badge, click-through, auto-dismisses in 6s) | `getByRole('dialog')` |
| Summary | back to hub | `getByRole('button', { name: 'Accueil' })` |

Facts the test relies on: 7 questions per numbers lesson (`TOTAL = 7`); the correct answer is NOT discoverable from the DOM, so questions are answered by brute force (wrong answers never advance); a completed lesson emits `lesson_started` + ≥7 `question_shown` + ≥7 `question_answered` + `lesson_completed` (NO `session_end` — that only fires on pagehide/profile-switch; do not assert one); the last correct answer awaits `flushEvents()` before the Summary renders; login does NOT prefetch bundles — the warm-up session fetches and Dexie-caches the numbers bundle, which is what makes the offline session playable; `context.setOffline()` drives `navigator.onLine` + the `online`/`offline` window events `SyncManager` listens to, and reconnect triggers an immediate flush.

- [ ] **Step 1: Write the test**

```ts
import { test, expect, type Page } from '@playwright/test';
import { prisma, pollUntil, FIXTURES } from '../helpers/db';

/** Count rows in the kid app's Dexie 'events' queue (IndexedDB 'gabee-kid'). */
function dexieEventCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('gabee-kid');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('events', 'readonly').objectStore('events').count();
          req.onsuccess = () => {
            resolve(req.result);
            db.close();
          };
          req.onerror = () => {
            reject(req.error);
            db.close();
          };
        };
      }),
  );
}

/** All queued envelope event_ids from the Dexie 'events' queue. */
function dexieEventIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('gabee-kid');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('events', 'readonly').objectStore('events').getAll();
          req.onsuccess = () => {
            resolve(
              (req.result as Array<{ envelope: { event_id: string } }>).map(
                (row) => row.envelope.event_id,
              ),
            );
            db.close();
          };
          req.onerror = () => {
            reject(req.error);
            db.close();
          };
        };
      }),
  );
}

/** Answer the current question by brute force: options never advance on a wrong
 * pick (same question replays, same order), so walk the options until "Suivant". */
async function answerCurrentQuestion(page: Page): Promise<void> {
  const answers = page.locator('.session-answers .answer-btn');
  await expect(answers.first()).toBeVisible();
  const optionCount = await answers.count();
  for (let i = 0; i < optionCount; i++) {
    await answers.nth(i).click();
    const feedbackBtn = page.locator('.feedback-strip .btn');
    await expect(feedbackBtn).toBeVisible();
    const label = (await feedbackBtn.textContent()) ?? '';
    await feedbackBtn.click(); // "Suivant" advances; "Réessayer" replays the same question
    if (label.includes('Suivant')) return;
  }
  throw new Error('exhausted all answer options without finding the correct one');
}

/** Complete a full 7-question numbers lesson and return to the hub. */
async function completeLessonAndGoHome(page: Page): Promise<void> {
  for (let q = 0; q < 7; q++) {
    await answerCurrentQuestion(page);
  }
  // Summary; a first-badge milestone dialog may cover it (click-through, 6s auto-dismiss).
  const dialog = page.getByRole('dialog');
  try {
    await dialog.waitFor({ state: 'visible', timeout: 3_000 });
    await dialog.click();
  } catch {
    /* no milestone this time */
  }
  await page.getByRole('button', { name: 'Accueil' }).click();
  await expect(page.locator('button.module-tile[data-module="numbers"]')).toBeVisible();
}

async function startNumbersSession(page: Page): Promise<void> {
  await page.locator('button.module-tile[data-module="numbers"]').click();
  await page.getByRole('button', { name: /Nombres & comptage/ }).click();
  await expect(page.locator('.session-answers .answer-btn').first()).toBeVisible();
}

test('offline session syncs every queued event to Postgres on reconnect', async ({
  page,
  context,
}) => {
  // ── Phase A (online): login, skip device pairing, pick profile, one warm-up
  // session — this Dexie-caches the numbers bundle so the offline session can run.
  await page.goto('/');
  await page.getByPlaceholder('Adresse e-mail').fill(FIXTURES.parentEmail);
  await page.getByPlaceholder('Mot de passe').fill(FIXTURES.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('button', { name: /Plus tard/ }).click();
  await page.getByRole('button', { name: FIXTURES.childName }).click();
  await startNumbersSession(page);
  await completeLessonAndGoHome(page);

  const child = await prisma.childProfile.findFirstOrThrow({
    where: { name: FIXTURES.childName },
  });

  // Warm-up events reach the server and the kid-side queue fully drains,
  // so phase B starts from a clean, unambiguous baseline.
  await pollUntil(() => prisma.event.count({ where: { profileId: child.id } }), (c) => c > 0);
  await pollUntil(() => dexieEventCount(page), (c) => c === 0);
  const starsAfterWarmup = (
    await prisma.childProfile.findUniqueOrThrow({ where: { id: child.id } })
  ).totalStars;

  // ── Phase B (offline): full session with the network down.
  await context.setOffline(true);
  await startNumbersSession(page);
  await completeLessonAndGoHome(page);

  // Everything queued locally; nothing reached the server.
  const queuedIds = await dexieEventIds(page);
  expect(queuedIds.length).toBeGreaterThanOrEqual(15); // lesson_started + ≥7 shown + ≥7 answered + lesson_completed
  expect(
    await prisma.event.count({ where: { eventId: { in: queuedIds } } }),
  ).toBe(0);

  // ── Phase C (reconnect): SyncManager's 'online' handler flushes automatically.
  await context.setOffline(false);
  await pollUntil(
    () => prisma.event.count({ where: { eventId: { in: queuedIds } } }),
    (c) => c === queuedIds.length, // EVERY queued event row lands in Postgres (phase1 DoD)
  );
  await pollUntil(() => dexieEventCount(page), (c) => c === 0); // queue fully drained
  const after = await prisma.childProfile.findUniqueOrThrow({ where: { id: child.id } });
  expect(after.totalStars).toBeGreaterThan(starsAfterWarmup); // offline progress merged too
});
```

- [ ] **Step 2: Run and stabilize**

```bash
pnpm run test:e2e
```

Expected: smoke + offline spec pass (2 tests). The first runs are the debug cycle for selector/timing details — the ASSERTIONS are the contract and must not be weakened:
- every queued `event_id` lands in Postgres after reconnect,
- zero of them are on the server while offline,
- the Dexie queue drains to 0,
- `totalStars` strictly increases from the offline session.

Bounded adjustments allowed (name them in your report): exact locator tweaks if a string differs from the UI-contract table (verify against the component source, don't guess); the `>= 15` queued-event floor if retries add more rows (floor may only go UP); poll timeouts. If an assertion fails against real behavior (e.g. events lost on reconnect), STOP — that is the product bug this test exists to catch.

Known risks, in order:
1. **Milestone dialog timing** — handled by the try/waitFor + Playwright actionability (the overlay auto-dismisses in 6s and `Accueil` clicks retry until unobstructed).
2. **Healthy-use limits** — the fixture parent has no configured limits; if a server-default soft-limit/look-away overlay interrupts (French heading "Petite pause !"), report DONE_WITH_CONCERNS with the overlay text — the fix is fixture-side limit config, not test workarounds.
3. **Geometry answers** render SVG (empty text) — the brute-force loop clicks by index, never by text, so this is already handled.
4. **"Réessayer" ambiguity** — `SessionError`'s retry button shares the text; the test's locator is scoped to `.feedback-strip`, which only exists during question feedback.

Run the spec 3× consecutively (`pnpm --filter @gabee/e2e run test` — global setup resets the DB each run) to shake out flakes before committing.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/kid-offline-sync.spec.ts
git commit -m "test(e2e/kid): offline session queues locally and syncs every event row on reconnect"
```

---

### Task 3: CI `e2e` job + full pipeline + PR

**Files:**
- Modify: `.github/workflows/ci.yml` (new `e2e` job parallel to `check`)

**Interfaces:**
- Consumes: the existing `check` job's setup steps (checkout/pnpm/node/install), its `postgres:14` service block, `db:generate` + `db:migrate:deploy`, and Task 1's `pnpm run build` + `pnpm --filter @gabee/e2e run test` entry points.
- Produces: the CI shape later phases extend (parent/admin projects, Lighthouse in phase 6).

- [ ] **Step 1: Add the `e2e` job** to `.github/workflows/ci.yml`, alongside `check` (copy the exact `services:`, pnpm/node setup, and Prisma steps from `check` — they are already correct for `gabee_test`):

```yaml
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/gabee_test
      DIRECT_URL: postgresql://postgres:postgres@localhost:5432/gabee_test
      TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/gabee_test
      AUTH_JWT_SECRET: e2e-ci-only-jwt-secret-not-a-real-secret
    services:
      postgres:
        # copy verbatim from the check job (postgres:14, gabee_test, health check)
    steps:
      # copy verbatim from check: checkout, pnpm/action-setup, setup-node (20, pnpm cache), pnpm install --frozen-lockfile
      - name: Generate Prisma client
        run: pnpm --filter @gabee/db run db:generate
      - name: Migrate test database
        run: pnpm --filter @gabee/db run db:migrate:deploy
      - name: Install Playwright browsers
        run: pnpm --filter @gabee/e2e exec playwright install --with-deps chromium
      - name: Build apps
        run: pnpm run build
      - name: Run e2e tests
        run: pnpm --filter @gabee/e2e run test
      - name: Upload Playwright artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-artifacts
          path: |
            e2e/test-results/
            e2e/playwright-report/
          retention-days: 7
```

Keep the workflow-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env as-is (it's global). Do NOT touch the `check` job or `lefthook.yml`. (Global setup does the seeding — no separate seed step needed.)

- [ ] **Step 2: Full local pipeline**

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration && pnpm run test:e2e
```

Expected: all green (lint may keep its ~31 pre-existing warnings; failures = STOP and report).

- [ ] **Step 3: Push and PR**

```bash
git push -u origin feature/test-offline-e2e
gh pr create --base main --title "test(e2e): phase 2b — Playwright bootstrap + kid offline sync e2e" --body "Completes phase 2 of docs/superpowers/specs/2026-07-14-test-strategy-design.md (offline core, product risk #1) — the e2e half deferred from PR #7.

- new repo-root e2e/ workspace (spec Layer 4): Playwright vs BUILT apps (next start :3000 + vite preview :5173) via webServer; global setup resets gabee_test, seeds content (db:seed → publish.mts) and login fixtures (seed-fixtures)
- kid offline scenario: login → warm-up session (Dexie-caches the bundle) → context.setOffline(true) → full 7-question session offline → reconnect → EVERY queued event_id lands in Postgres, kid-side queue drains to 0, progress merges (phase1 DoD)
- CI: parallel e2e job (chromium, trace+video artifacts on failure); check job and lefthook untouched

Parent/admin Playwright projects land with phases 3/5; Lighthouse joins the e2e job in phase 6."
```

- [ ] **Step 4: Watch CI to green** — `gh run list --branch feature/test-offline-e2e --limit 1`, then `gh run watch <id> --exit-status`. BOTH jobs (`check` + `e2e`) must pass. Iterate on failures; never fire-and-forget.

---

## Self-Review (done at plan-writing time)

- **Spec coverage (phase 2b):** Layer-4 bootstrap ✔ (Task 1 — repo-root `e2e/` workspace, built apps via `webServer`, seeded test Postgres, trace/video on failure); kid offline scenario ✔ (Task 2 — setOffline → full session → reconnect → every event row in Postgres, exactly the spec sentence + progress merge); CI `e2e` job + artifacts ✔ (Task 3). Deliberately out (declared in Architecture): parent/admin projects, Lighthouse, size-limit, `session_end` (not emitted by a completed lesson — asserting it would test a fiction).
- **Placeholders:** none — every step has runnable code/commands. Two bounded adjustment points name their check target (question-model field names in the smoke test; `__dirname` under ESM transform in global-setup).
- **Type consistency:** `FIXTURES`/`prisma`/`pollUntil` signatures match between Task 1 (producer) and Task 2 (consumer); `DB_URL`/`WEB_URL` exports used consistently; port/URL constants match the CORS and API-base defaults they must satisfy.
- **Known risk register:** healthy-use default limits (Task 2 risk 2, fixture-side fix), milestone overlay (risk 1, handled), publish-step dependency for playable bundles (baked into global-setup with a smoke assertion on `status: 'confirmed'`), `AUTH_JWT_SECRET` under `NODE_ENV=production` (config + turbo passThroughEnv + CI env), turbo strict env hiding the secret from `next build` (Task 1 Step 1).
