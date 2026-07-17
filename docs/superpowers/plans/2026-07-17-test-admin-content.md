# Phase 5b — Admin Content Integration + AI Test Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Layer-2/Layer-3 integration coverage for the admin content-management surface (plan → pool → review → confirm → publish, plus module/sub-mode CRUD and the admin-vs-super_admin route authz matrix), and a small dependency-injection seam so the AI provider can be faked deterministically in tests.

**Architecture:** Four untested services (`admin-content`, `admin-publish`, `admin-modules`, `admin-sub-modes`) get `*.integration.test.ts` files that seed real rows and assert real behavior + error codes against the `gabee_test` DB. Business-rule gates (plan FR/EN parity, pool rating/target, plan-not-accepted) are the highest-value branches. `getAiProvider()` becomes overridable so `generateQuestions`' insertion + gating logic is tested with a canned `FakeAiProvider` instead of a live model. A route-level test file asserts the `requireAdmin` vs `requireSuperAdmin` boundary per representative content route. The browser management-flow e2e is deferred to phase 5c.

**Tech Stack:** Node 20, pnpm workspaces, turbo, Prisma/Postgres, `node:test` via tsx, `@gabee/db/testing` factories, `apps/web/src/test/{auth,factories,setup-integration}.ts`.

## Global Constraints

- **`*.integration.test.ts` convention:** first import is `import '../../../test/setup-integration';` (route tests: `import '../../../../.../test/setup-integration'` — match the relative depth). Use `createTestClient()` + `resetDb(prisma)` in `beforeEach`, `after(() => prisma.$disconnect())`. These files are excluded from the unit glob and run `--test-concurrency=1`.
- **Admin authz is ROUTE-LAYER only.** Services (`admin-content` etc.) do NO role checks — they trust the caller. `requireAdmin` (role `admin`|`super_admin`) guards plan/pool/review/confirm/generate; `requireSuperAdmin` guards publish, module edit/status, and sub-mode create/update/delete. `requireAdmin`/`requireSuperAdmin` read role FRESH from DB, throw `403 forbidden` / `401 unauthorized` / `401 session_stale`.
- **`getDefaultCurriculumId()` (`apps/web/src/lib/server/admin.ts`) throws a plain `Error` (NOT `HttpError`) when no curriculum has `isDefault: true`.** Every service test MUST seed `createCurriculum(prisma, { isDefault: true })` or the call 500s unhelpfully. `POOL_TARGET = 20` and `POOL_LESSON` live in `admin.ts`.
- **`resetDb` truncates every table, including `modules`/`sub_modes` reference data.** Tests that call `getContentMatrix`, `admin-modules`, or `generateQuestions` (which reads `moduleDef`) must seed the needed `ModuleDef`/`SubMode` rows themselves.
- **`prisma/publish.mts` is NOT the code under test.** It bulk-confirms + snapshots directly, bypassing `confirmPool`/`publishModule`'s gates and audit trail. Never assume real service behavior matches seed-script state.
- **Question ids are semantic strings**, not uuids. `insertCandidates` sequences `{module}-{subMode}-l{level}-l{POOL_LESSON}-ai-{NNN}`.
- `QuestionStatus` enum = `candidate | confirmed | rejected | demoted`. `ContentPlanStatus` = `pending | ai_draft | accepted`. `Module` = `numbers | words | keyboard | code | translation`. `ModuleStatus` = `active | disabled`. `AccountRole` = `parent | admin | super_admin`.
- Run `pnpm run typecheck` before claiming any task green (**tsx strips types without checking** — tsx test runs pass on type errors). Route tests: reuse `webRequest`, `adminCookie`, `parentToken` from `apps/web/src/test/{auth,factories}.ts` and `createLoginableParent(prisma, { role })`.
- **No AI-attribution trailers** in commits or PR bodies. STOP-and-report (BLOCKED) on any real product bug or authz leak — do not weaken a test to make it pass.

---

## File Structure

- Create: `apps/web/src/lib/server/services/admin-content.integration.test.ts` (plan + pool + review — Tasks 2 & 3)
- Create: `apps/web/src/lib/server/services/admin-publish.integration.test.ts` (Task 5)
- Create: `apps/web/src/lib/server/services/admin-modules.integration.test.ts` (Task 6)
- Create: `apps/web/src/lib/server/services/admin-sub-modes.integration.test.ts` (Task 6)
- Create: `apps/web/src/app/api/admin/content/route-authz.integration.test.ts` (Task 7)
- Create: `apps/web/src/lib/server/ai/fake.ts` — `FakeAiProvider` (Task 4)
- Modify: `apps/web/src/lib/server/ai/index.ts` — add `setAiProvider(p)` / `resetAiProvider()` test override (Task 4)
- Modify: `packages/db/src/testing.ts` — add `createContentPlan`, `createSubMode`, `createModuleDef` factories (Task 1)

---

## Task 1: Content-model test factories

**Files:**
- Modify: `packages/db/src/testing.ts`
- Test: exercised transitively by Tasks 2–6 (no standalone test file; a factory with no consumer is YAGNI — this task lands with Task 2's first use in the same PR sequence, but is committed separately so its diff is reviewable).

**Interfaces produced (later tasks rely on these exact names/signatures):**
- `createModuleDef(prisma, overrides?: Partial<Prisma.ModuleDefUncheckedCreateInput>) => Promise<ModuleDef>` — default `id: 'numbers'`, `slug: 'numbers'`, `name: { fr: 'Nombres', en: 'Numbers' }`, `description: { fr: '', en: '' }`, `colorToken: 'blue'`, `icon: 'star'`, `characteristics: {}`, `status: 'active'`.
- `createSubMode(prisma, overrides?) => Promise<SubMode>` — default `id: 'numbers.default'`, `module: 'numbers'`, `key: 'default'`, `name: { fr:'Défaut', en:'Default' }`, `languageDependent: false`, `displayOrder: 0`, `mechanicHint: 'mcq'`.
- `createContentPlan(prisma, overrides?) => Promise<ContentPlan>` — default `curriculumId` resolved from `overrides.curriculumId ?? (await createCurriculum(prisma, { isDefault: true })).id`, `moduleId: 'numbers'`, `subMode: 'default'`, `level: 1`, `scope: { fr:'', en:'' }`, `pedagogicalObjectives: []`, `validationCriteria: { fr:'', en:'' }`, `status: 'pending'`. (A bare/empty plan is the FAILING-parity default; tests that need an acceptable plan pass full bilingual overrides.)

- [ ] **Step 1: Read the existing factory patterns** in `packages/db/src/testing.ts` (`createCurriculum`, `createQuestion`) and the three models in `packages/db/prisma/schema.prisma` (`ModuleDef` line ~520, `SubMode` line ~566, `ContentPlan` line ~536) for exact required fields and enum values.

- [ ] **Step 2: Add the three factories** following the `createQuestion` pattern (spread `...overrides` last except relational id resolution). Match field names to the Prisma `*UncheckedCreateInput` types. Export them from the same barrel the other factories use.

- [ ] **Step 3: Typecheck** — `pnpm run typecheck`. Expected: 7/7 pass (tsx won't catch a bad field name; typecheck will).

- [ ] **Step 4: Commit** — `test(db): content-model factories (ContentPlan/SubMode/ModuleDef) for phase-5b`.

---

## Task 2: admin-content — plan lifecycle integration

**Files:**
- Create: `apps/web/src/lib/server/services/admin-content.integration.test.ts`
- Read first: `apps/web/src/lib/server/services/admin-content.ts` (`getPlan`, `savePlan`, `acceptPlan`, `loadPlanRow`, `asBilingual`/`asBilingualArray`).

**Interfaces consumed:** Task 1 factories; `getDefaultCurriculumId` requires `isDefault:true` curriculum.

Behaviors to pin (assertions are the contract; read the service for exact response shapes):

- [ ] **Step 1: Write the plan tests.**
  - `getPlan(module, subMode, level)` on an empty slot returns `{ plan: null }` (no throw).
  - `savePlan(body)` upserts: first call creates, second call with the same `(curriculumId, moduleId, subMode, level)` UPDATEs (assert one row exists, fields updated). Seed `createCurriculum(prisma, { isDefault: true })` first.
  - `acceptPlan` happy path: seed a plan with FULL bilingual `scope`/`validationCriteria` and ≥1 objective each having non-empty `fr` AND `en`; assert returned `status === 'accepted'`, `acceptedBy === actorId`, `acceptedAt` set.
  - `acceptPlan` on a missing slot → `404 plan_not_found`.
  - `acceptPlan` **parity gate** → `422 parity_required` for EACH of these seeded-plan variants (parametrize or one test each): (a) `scope.en` empty, (b) `validationCriteria.fr` empty, (c) objectives empty array, (d) an objective with `en` empty. Assert no mutation (row `status` stays `pending`).

- [ ] **Step 2: Run** — `pnpm --filter @gabee/web run test:integration`. Expected: all new plan tests pass. Then `pnpm run typecheck`.

- [ ] **Step 3: Commit** — `test(web/admin-content): plan getPlan/savePlan/acceptPlan + parity gate`.

---

## Task 3: admin-content — pool, confirm, review integration

**Files:**
- Modify: `apps/web/src/lib/server/services/admin-content.integration.test.ts` (append)
- Read first: `admin-content.ts` `getPool`, `confirmPool`, `reviewQuestion`, `bulkSetQuestionStatus`, and **`ratingRollup`** (for the exact `ratings` JSON-array shape needed to make a candidate count as "rated ≥4 in both languages").

Behaviors to pin:

- [ ] **Step 1: Write a rating helper + pool tests.**
  - Add a local test helper `ratedCandidate(prisma, curriculumId, i)` that creates a `candidate` question whose `ratings` JSON makes `ratingRollup` return `fr.score >= 4 && en.score >= 4` (read `ratingRollup` for the shape — do NOT guess; assert the shape works by making one `confirmPool` happy-path test that would fail if the rating shape were wrong).
  - `getPool` returns `candidates`/`confirmed` split, `pool_target === 20`, `plan_accepted` reflects the plan status, and `rated_high` counts candidates rated ≥4 both langs.
  - `confirmPool` happy path: seed exactly `POOL_TARGET` (20) high-rated candidates → returns `{ confirmed: 20 }` and those rows are now `status: 'confirmed'` (assert via DB count).
  - `confirmPool` under target → `409 pool_under_target` when only 19 high-rated candidates exist (seed 19 high-rated + some low-rated); assert no candidate was promoted (DB still 0 confirmed).
  - `reviewQuestion(id, body, actorId)` applies a rating and recomputes `avgRating`; with `body.status` set it flips status. Assert the returned `AdminQuestion` reflects it. Unknown id → `404 question_not_found`.
  - `bulkSetQuestionStatus(ids, 'confirmed')` returns the count and sets all rows; repeat with `'rejected'` and `'demoted'` to cover the enum.

- [ ] **Step 2: Run + typecheck** as Task 2.

- [ ] **Step 3: Commit** — `test(web/admin-content): pool/confirm(target gate)/review/bulk-status`.

---

## Task 4: AI provider test seam + generateQuestions integration

**Files:**
- Modify: `apps/web/src/lib/server/ai/index.ts` (PRODUCTION change — the injectable seam)
- Create: `apps/web/src/lib/server/ai/fake.ts` (`FakeAiProvider`)
- Modify: `apps/web/src/lib/server/services/admin-content.integration.test.ts` (append generateQuestions tests)
- Read first: `apps/web/src/lib/server/ai/provider.ts` (`AiProvider`, `GenerateQuestionsInput`, `DraftedQuestion`, `GenerateQuestionsResult`), `admin-content.ts` `generateQuestions` + `insertCandidates`.

**Interfaces produced:**
- `setAiProvider(p: AiProvider): void` and `resetAiProvider(): void` in `ai/index.ts`.
- `FakeAiProvider` implementing `AiProvider`; constructor takes `(questions: DraftedQuestion[])`; `generateQuestions()` returns `{ questions, inputTokens: 0, outputTokens: 0 }`; `streamPlan`/`parsePlan` may throw `new Error('not used in tests')` (only `generateQuestions` is exercised).

- [ ] **Step 1: Add the seam** to `ai/index.ts`. Keep the existing lazy `cached` behavior; add:
```ts
export function setAiProvider(p: AiProvider): void {
  cached = p;
}
export function resetAiProvider(): void {
  cached = null;
}
```
This is the minimal override — `getAiProvider()` returns the injected instance until reset. No other production file changes.

- [ ] **Step 2: Write `ai/fake.ts`** — a `FakeAiProvider` returning canned `DraftedQuestion[]`. Each drafted question must be shaped so `insertCandidates`' filter (`prompt !== undefined && answer !== undefined`) keeps it: give `type: 'mcq-number'`, `lang: null`, `prompt: '1+1?'`, `answer: 2`, `distractors: [1,3]`, `difficulty: 1`, `theme: 'test'`, `objective_ref: null`, `concept_tags: []`.

- [ ] **Step 3: Write generateQuestions tests** (inject via `setAiProvider` in `beforeEach` or per-test; `resetAiProvider()` in `after` and after each test that sets it, so no cross-test bleed). Seed a `createModuleDef(prisma, { id: 'numbers' })` (generateQuestions reads `moduleDef`).
  - **Gate:** with a plan that is NOT accepted (status `pending`) → `generateQuestions(body, actorId)` throws `409 plan_not_accepted`; assert zero candidate rows were inserted.
  - **Happy path:** with an ACCEPTED plan + a `FakeAiProvider` returning 3 questions → returns a `PoolResponse` whose `candidates` grew by 3; assert 3 `candidate` rows with ids `numbers-default-l1-l{POOL_LESSON}-ai-001..003`.
  - **insertCandidates sequencing regression:** accept plan; generate 3 (→ ai-001..003); DELETE ai-002; generate 2 more; assert the new ids are ai-004 and ai-005 (strictly above the surviving max, NOT reusing 002) and that no row was silently dropped (total candidate count is 4). This is the `maxN`-not-`count(*)` guarantee.

- [ ] **Step 4: Run + typecheck.** Confirm `after`/reset restores the real provider (no other test file sees the fake — run the FULL web integration suite, not just this file).

- [ ] **Step 5: Commit** — `feat(web/ai): injectable provider seam + FakeAiProvider; test generateQuestions gate + id-sequencing`.

---

## Task 5: admin-publish integration

**Files:**
- Create: `apps/web/src/lib/server/services/admin-publish.integration.test.ts`
- Read first: `admin-publish.ts` (`listPendingChanges`, `publishModule`), `writeAudit` (audit-row shape), `ContentBundleVersion` model.

Behaviors to pin:

- [ ] **Step 1: Write publish tests** (seed `createCurriculum(prisma, { isDefault: true })`; publish reads confirmed questions + latest bundle version).
  - `listPendingChanges(curriculumId)` diff: seed 2 confirmed questions and NO bundle version → the module reports them as `added`. Then create a `ContentBundleVersion` snapshotting 1 of them + confirm a new one → assert `added`/`removed`/`modified` buckets reflect the delta between confirmed pool and latest snapshot. (Read the response shape for exact bucket names.)
  - `publishModule(curriculumId, 'numbers', actorId, 'super_admin')` mints a `ContentBundleVersion`: `version === latestExisting + 1`, `questionIds` = the confirmed ids **sorted**, `questionCount` matches. Assert a second publish increments to the next version.
  - **Audit:** after `publishModule`, an `AuditLog` row exists with `kind: 'bundle.publish'`, `actorId`, `actorRole`, `targetId` = module. (Contrast: `prisma/publish.mts` writes NO audit — this proves the service path does.)
  - **Zero-change publish is allowed by design:** publishing a module with no pending diff still mints the next version (assert no throw). Note this explicitly in a comment so a future reviewer doesn't "fix" it.

- [ ] **Step 2: Run + typecheck.**

- [ ] **Step 3: Commit** — `test(web/admin-publish): pending-diff + publishModule snapshot/version/audit`.

---

## Task 6: admin-modules + admin-sub-modes integration

**Files:**
- Create: `apps/web/src/lib/server/services/admin-modules.integration.test.ts`
- Create: `apps/web/src/lib/server/services/admin-sub-modes.integration.test.ts`
- Read first: `admin-modules.ts`, `admin-sub-modes.ts`.

Behaviors to pin:

- [ ] **Step 1: admin-modules tests** (seed `createModuleDef`).
  - `listModules()` returns seeded modules.
  - `getModule(id)` returns detail; unknown id → `404 module_not_found`.
  - `updateModule(id, patch)` applies the patch; unknown id → `404 module_not_found`.
  - `setModuleStatus(id, { status })` flips `active`↔`disabled` (assert the DB row); unknown id → `404 module_not_found`.

- [ ] **Step 2: admin-sub-modes tests** (seed `createModuleDef` + `createSubMode`).
  - `listSubModes()` returns all; `listSubModes('numbers')` filters; an invalid module string → `400 invalid_module`.
  - `createSubMode(body)` creates; a duplicate `(module, key)` → `409 sub_mode_exists`.
  - `updateSubMode(id, patch)` updates; unknown id → `404 sub_mode_not_found`.
  - `deleteSubMode(id)` deletes an unreferenced sub-mode; unknown id → `404 sub_mode_not_found`.
  - **`409 sub_mode_in_use`:** seed a `Question` (or `ContentPlan`) referencing the sub-mode, then `deleteSubMode` → `409 sub_mode_in_use`; assert the sub-mode still exists (no side effect). Cover BOTH the dotted-id (`numbers.default`) and legacy short-key reference forms if the service checks both.

- [ ] **Step 3: Run + typecheck.**

- [ ] **Step 4: Commit** — `test(web/admin): modules + sub-modes CRUD, 404/400/409 in-use`.

---

## Task 7: Route-layer admin/super_admin authz matrix

**Files:**
- Create: `apps/web/src/app/api/admin/content/route-authz.integration.test.ts`
- Read first: `apps/web/src/app/api/admin/users/parents/route.integration.test.ts` (the working template), `apps/web/src/test/auth.ts` (`webRequest`, `adminCookie`, `parentToken`), `apps/web/src/test/factories.ts` (`createLoginableParent`), `http.ts` (`requireAdmin`/`requireSuperAdmin` error codes).

**Why route-level:** services do no role checks, so the admin/super_admin boundary ONLY exists at the route layer and can only be tested by invoking the route handlers.

- [ ] **Step 1: Write the matrix.** Pick a representative `requireAdmin` route (e.g. `GET /api/admin/content/matrix` via `content/matrix/route.ts`) and a representative `requireSuperAdmin` route (`POST /api/admin/content/publish` via `content/publish/route.ts`). Seed loginable parents of each role with `createLoginableParent(prisma, { role })` and drive the handler with `webRequest(..., { cookie: adminCookie(token) })`. Assert:
  - unauthenticated (no cookie) → `401` (`unauthorized`).
  - plain `parent` role → `403 forbidden` on BOTH routes.
  - `admin` role → allowed (2xx / non-403) on the `requireAdmin` route, but `403 forbidden` on the `requireSuperAdmin` route.
  - `super_admin` role → allowed on BOTH.
  - (If reachable without heavy setup) a `session_stale` case per the users/parents template; otherwise skip — do not fabricate state.
  - Use distinct `x-forwarded-for` per request (rate-limiter isolation), per the `webRequest` convention.

- [ ] **Step 2: Run + typecheck.** Note in a comment that this file is a route test (imports `setup-integration` at the correct relative depth).

- [ ] **Step 3: Commit** — `test(web/admin): route authz matrix — requireAdmin vs requireSuperAdmin (401/403)`.

---

## Task 8: Full pipeline + PR

- [ ] **Step 1: Full local pipeline** — `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration`. Any FAILURE = STOP and report. (e2e is unaffected — no e2e in 5b.)

- [ ] **Step 2: Push + PR** — `git push -u origin feature/test-admin-content`, then `gh pr create --base main` titled `test(admin): phase 5b — admin content plan/pool/publish integration + AI test seam`, body summarizing: the 4 services now covered, the two business-rule gates (parity 422, pool target 409), the injectable AI seam + fake, the id-sequencing regression guard, the route authz matrix, and the one production change (`ai/index.ts` seam). Note phase 5c (admin management-flow e2e) is next.

- [ ] **Step 3: Watch CI to green** — `gh run list --branch feature/test-admin-content --limit 1`, then `gh run watch <id> --exit-status`; confirm both `check` and `e2e` jobs succeed. Never fire-and-forget.

---

## Self-Review (done at plan-writing time)

- **Spec coverage (phase 5b):** spec §5 "Parent/admin surfaces: remaining API integration + management-flow e2e" and Layer-3 rollout order "…then `admin/*`". This plan covers the admin `*` API/service integration (Tasks 2–7); the Layer-4 admin management-flow e2e (`login → content plan/pool/publish → users → healthy-use limits`) is deferred to phase 5c (declared in Architecture) to keep the PR reviewable, matching the a/b split of phases 3 and 4.
- **AI seam decision:** the user chose "add a fake-provider seam" over skipping the AI paths — hence Task 4's one production change (`ai/index.ts`) + `FakeAiProvider`, covering `generateQuestions`' gate and `insertCandidates` sequencing. This is the plan's only production-code touch; all other tasks are test-only.
- **Placeholders:** every task names the exact service file to read for signatures and pins behaviors + exact HttpError codes (from the surface inventory). Internal shapes that must be exact (`ratings` array for `ratingRollup`, pending-diff bucket names, `POOL_LESSON`) are called out with a "read the service, don't guess" instruction rather than a fabricated literal.
- **Type consistency:** factories from Task 1 (`createContentPlan`/`createSubMode`/`createModuleDef`) are consumed by Tasks 2–6 under those exact names; `setAiProvider`/`resetAiProvider`/`FakeAiProvider` from Task 4 are used only within Task 4's tests; route tests reuse `webRequest`/`adminCookie`/`parentToken`/`createLoginableParent`.
- **Known risk register:** (1) `getDefaultCurriculumId` throws a plain `Error` — Global Constraints mandate `isDefault:true` seeding. (2) `resetDb` wipes reference tables — tests seed their own `ModuleDef`/`SubMode`. (3) fake-provider bleed across files — Task 4 resets in `after` and runs the FULL suite to prove isolation. (4) a service may reveal a real authz/behavior bug — every task says STOP-and-report, not weaken. (5) `ratingRollup` shape is internal — Task 3 makes the happy-path `confirmPool` the proof that the seeded rating shape is right.
