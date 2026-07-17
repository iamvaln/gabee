# Phase 5c — Admin Management-Flow E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exercise the admin content-management ACTIONS end-to-end in a real browser against built apps — plan edit→accept, publish a pending module, module enable/disable, sub-mode create/delete — plus prove the admin-vs-super_admin authorization boundary in-browser with a new non-super `admin` fixture.

**Architecture:** New Playwright specs under `e2e/tests/admin/` (the existing `admin` project: baseURL :3000, `testMatch: /admin\/.*\.spec\.ts/`). The existing `admin-flow.spec.ts` covers login + view-only content matrix; this phase drives the mutating actions. Data-state problems (post-global-setup everything is published with no pending diff, and confirmPool needs 20 rated candidates — impractical to click) are solved by seeding the precise precondition directly via `prisma` in `e2e/helpers/db.ts` before driving the UI, then asserting the post-condition via both the UI and the DB. A new plain-`admin` fixture (`tester3`) is added to prove the browser authz boundary.

**Tech Stack:** Playwright, built Next app (`next start` :3000), seeded `_test` Postgres, `@playwright/test`, `e2e/helpers/db.ts` (`prisma`, `FIXTURES`, `pollUntil`).

## Global Constraints

- The admin/kid UI is **French by default.** All visible-text selectors are French: login button `Se connecter`, plan `Enregistrer`/`Accepter`, publish `Publier v{N+1}`, module `Désactiver`/`Réactiver`, sub-mode `Ajouter un sous-mode`/`Supprimer`.
- E2E runs against **built** apps + a seeded+published DB via global-setup: `resetDb → db:seed (candidates) → publish.mts (confirm+publish) → seed-fixtures (STAGING_FIXTURES=1) → promote tester2→super_admin`. So post-setup: every module is published, no pending diff, and pools have no leftover `candidate` rows.
- **Admin login page:** `/admin/login`, inputs `#ae` (email) + `#ap` (password), button `Se connecter`; on success redirects to `/admin`.
- **Admin authz is route-layer:** `requireAdmin` (plan/pool/review/confirm/generate) vs `requireSuperAdmin` (publish, module edit/status, sub-mode mutations). The UI ALSO hides super-admin-only controls for a plain admin (server components gate on role) — this phase asserts the UI-hiding AND (where practical) the API 403.
- **Never drive the AI-generate step in e2e** (no live model; non-deterministic) — it is covered at integration (phase 5b). Seed candidates/plans via `prisma` instead.
- Local run needs env exported (`DATABASE_URL`/`DIRECT_URL`/`TEST_DATABASE_URL`/`AUTH_JWT_SECRET`) for the Next build, and stale servers killed (`lsof -ti:3000,:5173 | xargs -r kill -9`) — parallel worktrees squat the ports and Playwright's `reuseExistingServer:!CI` reuses them. CI builds fresh.
- `x-forwarded-for` for the admin project is fixed at `10.20.0.2` (login rate-limit isolation) — don't override per-request in specs.
- No AI-attribution trailers. STOP-and-report (BLOCKED) on any real product/authz bug — do not weaken a test to make it pass.

---

## File Structure

- Modify: `packages/db/prisma/seed-fixtures.ts` — add `tester3@staging.gabee.app` (plain-admin fixture: shared hash/salt + ConsentRecord) — Task 1
- Modify: `e2e/global-setup.ts` — promote `tester3` to role `admin` — Task 1
- Modify: `e2e/helpers/db.ts` — add `adminOnlyEmail`/`adminOnlyPassword` to `FIXTURES` + a `seedPendingPublish(module)` helper — Tasks 1 & 2
- Create: `e2e/tests/admin/content-publish.spec.ts` — Task 2
- Create: `e2e/tests/admin/modules-and-submodes.spec.ts` — Task 3
- Create: `e2e/tests/admin/content-plan.spec.ts` — Task 4
- Create: `e2e/tests/admin/admin-authz.spec.ts` — Task 5

---

## Task 1: Non-super admin fixture + FIXTURES wiring

**Files:** `packages/db/prisma/seed-fixtures.ts`, `e2e/global-setup.ts`, `e2e/helpers/db.ts`.

**Interfaces produced:** `FIXTURES.adminOnlyEmail = 'tester3@staging.gabee.app'`, `FIXTURES.adminOnlyPassword = 'staging-pass'`.

- [ ] **Step 1: Add tester3 to seed-fixtures.ts.** Mirror the tester1/tester2 upsert loop: a third `ParentAccount` id `P3 = '00000000-0000-4000-9000-000000000003'`, email `tester3@staging.gabee.app`, `emailConfirmedAt: new Date()`, `credentials.create` with the SAME `SHARED_HASH`/`SHARED_SALT` (so `staging-pass` logs in), and a `ConsentRecord` (id `...0000000000c3`, type `terms`, `version: CURRENT_TERMS_VERSION`) so login isn't redirected to `/parent/terms-update`. Add P3 to the account loop and the consent loop (no kids needed).

- [ ] **Step 2: Promote tester3 to `admin` in global-setup.ts.** After the tester2→super_admin update, add a second `parentAccount.update({ where: { email: 'tester3@staging.gabee.app' }, data: { role: 'admin' } })`. (Plain admin — NOT super_admin.)

- [ ] **Step 3: Extend FIXTURES** in `e2e/helpers/db.ts`: `adminOnlyEmail: 'tester3@staging.gabee.app'`, `adminOnlyPassword: 'staging-pass'`.

- [ ] **Step 4: Verify the fixture seeds.** Run global-setup path locally (or just the seed scripts against the `_test` DB) and assert via prisma that tester3 exists with role `admin`. Commit: `test(e2e): add non-super admin fixture (tester3) for the authz boundary`.

---

## Task 2: Publish-a-pending-module e2e

**Files:** `e2e/helpers/db.ts` (add `seedPendingPublish`), `e2e/tests/admin/content-publish.spec.ts`.

**Precondition problem:** post-global-setup there is no pending diff, so the Publish button won't render. Manufacture one via prisma: insert a NEW `confirmed` question for a module that is NOT in that module's latest `ContentBundleVersion.questionIds` → `listPendingChanges` now reports it as `added` → the publish page renders `Publier v(N+1)`.

- [ ] **Step 1: `seedPendingPublish(module)` helper** in `helpers/db.ts`: look up the module's default curriculum (`prisma.curriculum.findFirst({ where: { isDefault: true } })`), create a `confirmed` `Question` (unique id like `e2e-pending-${module}-${Date.now-free-uniq}`; use a fixed id so it's idempotent-ish, e.g. `e2e-pending-numbers-1`, module `numbers`, subMode `counting`, level 1, valid `prompt`/`answer`, `status: 'confirmed'`). Return the new question id + the module's current latest version (via `contentBundleVersion.findFirst({ where:{module}, orderBy:{version:'desc'} })`).

- [ ] **Step 2: Write the publish spec.**
  - `beforeEach`/inline: `await seedPendingPublish('numbers')` capturing `latestVersion`.
  - Login as super_admin (`FIXTURES.adminEmail`/`adminPassword`) via `/admin/login` (`#ae`/`#ap` + `Se connecter`).
  - Go to `/admin/content/publish`. Assert the numbers row shows a `Publier v${latestVersion + 1}` button (name matches `new RegExp('Publier v' + (latestVersion+1))`).
  - Click it → a confirm modal appears (`Publier numbers v${n} ?`) → click the modal's `Publier v${n}` button.
  - Assert success: the page reflects the new version (e.g. the row now shows `À jour` / up-to-date, or the button is gone). AND assert via prisma `pollUntil` that a `ContentBundleVersion` with `version === latestVersion + 1` now exists for `numbers` and its `questionIds` includes the seeded id.
  - Assert a `bundle.publish` `AuditLog` row exists for this publish.

- [ ] **Step 3: Run just this spec** (see Task 6 run recipe) until green. Commit: `test(e2e/admin): publish a pending module → new bundle version + audit`.

---

## Task 3: Module enable/disable + sub-mode create/delete e2e

**Files:** `e2e/tests/admin/modules-and-submodes.spec.ts`. Read first: `apps/web/src/app/admin/modules/[id]/ModuleControls.tsx` + `sub-modes-section.tsx` for exact button labels/fields.

- [ ] **Step 1: Module disable/re-enable spec.**
  - Login super_admin → `/admin/modules/numbers`.
  - Click `Désactiver` → assert (poll prisma) `moduleDef.findUnique({where:{id:'numbers'}}).status === 'disabled'` AND the button flips to `Réactiver`.
  - Click `Réactiver` → assert status back to `active`. (Leaves state clean for other specs.)

- [ ] **Step 2: Sub-mode create + delete spec.**
  - Login super_admin → `/admin/modules/numbers` (sub-modes section).
  - Click `Ajouter un sous-mode` → in the modal fill the key field (placeholder `arithmetic` → use `e2etest`) + the required name FR/EN fields (read `sub-modes-section.tsx` for the exact fields; `display_order` must be ≥ 1) → click the modal `Ajouter un sous-mode`/save (`btn brand`) button.
  - Assert (poll prisma) `subMode.findUnique({where:{id:'numbers.e2etest'}})` exists AND the row appears in the section.
  - Click that row's `Supprimer` → confirm in the delete modal (`Supprimer`) → assert prisma row gone AND row removed from the UI.
  - (The new sub-mode is unreferenced, so delete succeeds — this exercises the happy path; the `sub_mode_in_use` 409 is covered at integration.)

- [ ] **Step 3: Run + green.** Commit: `test(e2e/admin): module enable/disable + sub-mode create/delete`.

---

## Task 4: Plan editor save + accept e2e

**Files:** `e2e/tests/admin/content-plan.spec.ts`. Read first: `apps/web/src/app/admin/content/plan/PlanEditor.tsx`.

**Selector note:** the editor has THREE bilingual field groups (scope, objectives, validation), each a pair of textareas with placeholders `FR`/`EN`. Scope them by their section — locate the `field-label` text (`Portée du niveau`, `Objectifs pédagogiques`, `Critères de validation`) and select the `FR`/`EN` textareas within that group (e.g. `page.locator('section:has(.field-label:has-text("Portée")) textarea[placeholder="FR"]'` or the nearest stable container — verify the DOM at runtime). Do NOT use a bare `getByPlaceholder('FR')` (ambiguous across all three groups).

- [ ] **Step 1: Write the plan spec.**
  - Login super_admin → navigate to a plan slot the URL encodes, e.g. `/admin/content/plan?module=numbers&sub_mode=counting&level=2` (a level with no accepted plan; verify the route's query params from `plan/page.tsx`). If a slot is pre-seeded/accepted, pick a higher level that is empty.
  - Fill scope FR+EN, one objective FR+EN (click `Ajouter`/add-objective if the list starts empty — read the label), and validation FR+EN — all non-empty (the parity gate needs every field in both languages).
  - Click `Enregistrer` (Save) → assert a saved indication (toast/status; read the component for the exact success signal) AND prisma shows a `ContentPlan` row for that slot.
  - Click `Accepter` (Accept) → assert the UI reflects `accepted` (status badge / the "generation unlocked" hint) AND prisma shows the plan `status === 'accepted'` with `acceptedBy` set.
  - (Parity failure 422 is covered at integration — the browser test drives the happy path.)

- [ ] **Step 2: Run + green** (plan-editor selectors are the most fragile; expect a couple of iterations). If a selector cannot be made stable without a product change, STOP and report — do not add `data-testid` to production without surfacing it. Commit: `test(e2e/admin): plan editor fill → save → accept`.

---

## Task 5: Admin-vs-super_admin authorization boundary e2e

**Files:** `e2e/tests/admin/admin-authz.spec.ts`. Uses the `tester3` plain-admin fixture from Task 1.

- [ ] **Step 1: Write the boundary spec.** Login as the plain admin (`FIXTURES.adminOnlyEmail`/`adminOnlyPassword`).
  - The admin CAN reach `requireAdmin` surfaces: `/admin/content` renders the matrix (no redirect/403).
  - Publish is super-admin only: seed a pending diff (`seedPendingPublish('words')`), go to `/admin/content/publish`, and assert the `Publier v…` button is NOT present for the plain admin (the page gates it on role). If the UI shows a disabled/placeholder instead, assert that; if the button is entirely absent, assert `await expect(page.getByRole('button', { name: /Publier v/ })).toHaveCount(0)`.
  - Module edit/status is super-admin only: go to `/admin/modules/numbers` and assert the `Désactiver`/`Éditer le module` controls are NOT present for the plain admin.
  - (Optional, if cheap) assert the API boundary directly: `page.request.post('/api/admin/content/publish', { data: { module: 'words' } })` returns 403 for the admin session cookie. Read whether the browser context carries the admin cookie to `page.request` — if not, skip and rely on the UI-absence assertions (the 403 is already covered deterministically by the phase-5b route matrix).

- [ ] **Step 2: Run + green.** Commit: `test(e2e/admin): plain-admin authz boundary — no publish / no module edit`.

---

## Task 6: Full e2e run + pipeline + PR

**Local e2e run recipe** (per Global Constraints): export `DATABASE_URL`/`DIRECT_URL`/`TEST_DATABASE_URL` (pointing at the `_test` DB) + `AUTH_JWT_SECRET`; `lsof -ti:3000,:5173 | xargs -r kill -9`; then `pnpm run test:e2e` (or the admin project only during iteration: `pnpm --filter <e2e-pkg> exec playwright test --project=admin`). Global-setup reseeds each run.

- [ ] **Step 1: Run the FULL e2e suite** (all projects: kid/parent/admin) locally to confirm the new fixture + specs didn't disturb existing specs (e.g. the parents-table count, the IDOR probe that relies on fixture ids). Any FAILURE = STOP and report.
- [ ] **Step 2: Run the rest of the pipeline** — `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration`. (Unaffected, but the seed-fixtures change touches `@gabee/db`.)
- [ ] **Step 3: Push + PR** — `git push -u origin feature/test-admin-e2e`, `gh pr create --base main` titled `test(e2e): phase 5c — admin management-flow e2e (publish/modules/sub-modes/plan/authz)`, body summarizing the 4 driven flows + the new plain-admin fixture + the prisma-seeded preconditions + what stays integration-only (AI-generate, confirmPool-20, parity-422).
- [ ] **Step 4: Watch CI to green** — both `check` and `e2e` jobs. E2E flake is real; if a spec flakes, diagnose (don't just retry) — stabilize selectors/waits. Never fire-and-forget.

---

## Self-Review (done at plan-writing time)

- **Spec coverage:** spec Layer-4 "admin: login → content plan/pool/publish → users → healthy-use limits" — login/users/healthy-use already covered by `admin-flow.spec.ts`; this phase adds the plan/pool/**publish** ACTIONS (Tasks 2 & 4) the existing spec left view-only, plus the user-chosen module/sub-mode management (Task 3) and the browser authz boundary (Task 5). The pool's confirm-20 and AI-generate stay integration-only (declared in Global Constraints) — impractical/non-deterministic in a browser.
- **Precondition strategy:** every data precondition the seeded+published DB doesn't provide (a pending diff, a fresh plan slot, a deletable sub-mode) is seeded via `prisma` in-test, then the post-condition is asserted via BOTH the UI and the DB (`pollUntil`) — the DB assertion is what makes each test non-vacuous.
- **Fixture risk:** adding tester3 changes seed-fixtures — Task 6 Step 1 runs the FULL suite to catch collateral (the parents-table count in `admin-flow.spec.ts`, the IDOR probe's fixed ids). tester3 has no kids and a distinct id, minimizing blast radius.
- **Selector fragility:** the plan editor (Task 4) is the fragile one (ambiguous FR/EN placeholders) — the task mandates section-scoped locators and says STOP rather than adding `data-testid` to production without surfacing it.
- **Type consistency:** `FIXTURES.adminOnlyEmail/adminOnlyPassword` (Task 1) are consumed by Task 5; `seedPendingPublish(module)` (Task 2) is reused by Task 5.
