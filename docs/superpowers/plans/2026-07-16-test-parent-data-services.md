# Parent Data Services Integration Tests (Phase 5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the remaining parent-facing Layer-2 data services under integration test against real Postgres — the services the spec names for phase 5: `profiles`, `gifts`, `healthy-use`, `family`, `messages`, `bundles`.

**Architecture:** Phase 5 of `docs/superpowers/specs/2026-07-14-test-strategy-design.md` (Layer 2 item 4 + Layer 3 parent routes), split in two: **5a (this plan)** = parent data-service integration; **5b (next plan)** = admin content-management (plan/pool/publish) integration + the admin management-flow e2e. Each service gets a focused `*.integration.test.ts` covering its core behavior AND its ownership/auth boundary (a parent must never read/mutate another family's data). Reuses the established convention (setup-integration, `@gabee/db/testing` factories, `--test-concurrency=1`, `resetDb` per test).

**Tech Stack:** node:test via tsx, `@gabee/db/testing` (`createTestClient`/`resetDb`/`createParent`/`createChild`), real Postgres 14, `apps/web/src/test/factories.ts` (`createLoginableParent`), `HttpError`.

## Global Constraints

- **Never add `Co-Authored-By`/AI-attribution trailers to commits or PR bodies** (user rule).
- **Test-only phase.** Zero production changes. **If a test reveals a real bug** (a service behaves wrongly / an ownership boundary is missing), STOP and report — do NOT weaken the assertion. (Phases 3b/4b each caught a real bug this way.)
- `*.integration.test.ts`, first import `'../../../test/setup-integration'`, one shared `createTestClient()`, `beforeEach(() => resetDb(prisma))`, `after(() => prisma.$disconnect())`, `--test-concurrency=1`. Follow `apps/web/src/lib/server/services/progress.integration.test.ts` / `classifications.integration.test.ts` as the pattern.
- **Ownership is the through-line**: every service is called with a `parentId`/`kidId`; every task MUST assert that a STRANGER parent cannot read or mutate another parent's child/gift/message/family data (the services should 403/404 or return empty — assert the REAL behavior; a missing boundary is a bug → STOP and report).
- **`typecheck` MUST pass** before any green claim (tsx doesn't typecheck — a prior lesson).
- **gabee_test must be migrated** (the branch includes the consent_records + any newer migrations). If a test 500s with "table does not exist", run `pnpm --filter @gabee/db run db:migrate:test` (a local-env fix; CI migrates fresh).
- Reuse factories; do NOT hand-roll parent/child creation. For a login-able parent use `createLoginableParent` (apps/web/src/test/factories.ts); for a plain child use `createChild` (@gabee/db/testing).
- Node 20, pnpm, repo root = worktree root. Branch `feature/test-parent-admin-surfaces` off `origin/main`.

---

### Task 0: Branch

- [ ] **Step 1:** Worktree/branch `feature/test-parent-admin-surfaces` off `origin/main` (already created; verify `git status -sb`). Deps + prisma generated. Ensure gabee_test is migrated (`pnpm --filter @gabee/db run db:migrate:test`).

---

### Task 1: `profiles` — child CRUD + ownership

**Files:** Test: `apps/web/src/lib/server/services/profiles.integration.test.ts`

**Service (read `apps/web/src/lib/server/services/profiles.ts` first for exact signatures):** `listProfiles(parentId)`, `createProfile(parentId, body)`, `updateProfile(parentId, id, body)`, `deleteProfile(parentId, id)`, `requestProfileIncrease(parentId)`. Note the per-parent child LIMIT (createProfile enforces a cap unless increased — check the constant/behavior).

**Behaviors to pin:**
- `createProfile` creates a child owned by the parent; `listProfiles(parentId)` returns only that parent's children.
- `updateProfile`/`deleteProfile` by the OWNER work; by a STRANGER parent → 404/403 (assert the real code, don't mutate another family's child).
- The child limit: creating beyond the cap is rejected (find the cap + error code in the service); `requestProfileIncrease` records/raises it (assert its DB effect).

- [ ] **Step 1: Write the test** (skeleton — adapt to real signatures/HttpError codes):

```ts
import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createParent } from '@gabee/db/testing';
import { listProfiles, createProfile, updateProfile, deleteProfile } from './profiles';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('createProfile creates an owned child; listProfiles is scoped to the parent', async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createProfile(parent.id, { name: 'Ada', /* + required fields per profiles.ts */ } as never);
  assert.equal((await listProfiles(parent.id)).some((c) => c.id === child.id), true);
  assert.equal((await listProfiles(stranger.id)).length, 0); // stranger sees none
});

test("a stranger parent cannot update or delete another parent's child", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createProfile(parent.id, { name: 'Ada' } as never);
  await assert.rejects(() => updateProfile(stranger.id, child.id, { name: 'X' } as never),
    (e: unknown) => e instanceof HttpError && (e.status === 404 || e.status === 403));
  await assert.rejects(() => deleteProfile(stranger.id, child.id),
    (e: unknown) => e instanceof HttpError && (e.status === 404 || e.status === 403));
});
```
Add a child-limit test if the cap is small enough to hit deterministically (create up to the cap, assert the next create rejects; then `requestProfileIncrease` and assert the DB flag/limit changed).

- [ ] **Step 2: Run** — `pnpm --filter @gabee/web run test:integration` → all pass. Ownership failure against the real service = product bug: STOP and report. **Step 3: Commit** `test(web/profiles): child CRUD + cross-parent ownership boundary`.

---

### Task 2: `gifts` — grant → pending → claim (+ star evidence)

**Files:** Test: `apps/web/src/lib/server/services/gifts.integration.test.ts`

**Service (read `gifts.ts`):** `grantGift({ ... })`, `listPendingGifts(parentId, ...)`, `claimGift(parentId, giftId)`. NOTE: claimed gifts count toward the star-evidence cap (`countEvidencedStars` in progress.ts sums `kidGift where status='claimed'`) — so this ties to the star system.

**Behaviors to pin:**
- `grantGift` creates a pending gift for a child; `listPendingGifts` returns it.
- `claimGift` by the OWNER moves it to `claimed` (assert the `KidGift.status`/`amount`); claiming again is idempotent OR 409 (assert the real behavior); a STRANGER parent claiming → 404/403.
- The claimed amount is what the star cap counts (a claimed gift of amount N raises evidence by N — you can cross-check by calling `syncProgress` with a total_stars claim = N and asserting it's NOT clamped, reusing the progress test pattern; optional but high-value since it ties gifts to the fix in PR #24).

- [ ] **Step 1: Write the test** (read `gifts.ts` for the grant input shape + claim semantics; assert grant→pending→claim + ownership + the claimed-amount evidence). **Step 2: Run** → pass (STOP on a real bug). **Step 3: Commit** `test(web/gifts): grant/claim lifecycle, ownership, claimed-gift star evidence`.

---

### Task 3: `messages` — parent↔kid messaging + ownership + read state

**Files:** Test: `apps/web/src/lib/server/services/messages.integration.test.ts`

**Service (read `messages.ts`):** `createMessage(...)`, `listParentMessages(parentId, ...)`, `getMessageForParent(parentId, id)`, `deleteUnreadMessage(parentId, id)`, `listPendingForChild(...)`, `markAsRead(parentId, messageId)`, `countUnreadFromParent(parentId)`.

**Behaviors to pin:**
- `createMessage` (parent→kid) creates a message; `listParentMessages` returns the parent's; `getMessageForParent` by a STRANGER → 404.
- `listPendingForChild` returns unread messages for that child; `markAsRead` flips read state (assert the DB), and `countUnreadFromParent` reflects it.
- `deleteUnreadMessage`: deletes an UNREAD message (owner only); deleting a READ/already-delivered one → the real behavior (no-op/404 — assert it); a stranger → 404.

- [ ] **Step 1: Write the test** (create parent+child, send a message, exercise pending/read/count + ownership). **Step 2: Run** → pass (STOP on a real bug). **Step 3: Commit** `test(web/messages): parent↔kid send/read/delete lifecycle + ownership`.

---

### Task 4: `family` — co-parent invite lifecycle + access

**Files:** Test: `apps/web/src/lib/server/services/family.integration.test.ts`

**Service (read `family.ts`):** `getFamilyPanel(parentId)`, `createCoparentInvite(...)`, `acceptCoparentInvite(...)`, `cancelCoparentInvite(inviterId, inviteId)`, `removeCoparent(...)`. Co-parent invites likely use a token (like email confirmation) — check how the invite token is generated/stored (if it's `sha256` like the auth tokens, seed a known token or use the returned token).

**Behaviors to pin:**
- `createCoparentInvite` creates a pending invite (assert the row); `cancelCoparentInvite` by the INVITER cancels it; by a stranger → 403/404.
- `acceptCoparentInvite` (by the invitee, with the invite token) links the co-parent → the co-parent now appears in `getFamilyPanel` and gains access to the family's children (assert the access grant — e.g. `accessibleKidIds` or `listProfiles` now includes them, whichever the code exposes).
- `removeCoparent` revokes access (co-parent no longer sees the children).

- [ ] **Step 1: Write the test** (two parents; invite → accept → assert co-parent access → remove → assert revoked; + cancel + stranger boundary). If the invite token is sha256-stored (unreadable), seed a known-token invite row like the auth tests did, OR use the token the create returns — read `family.ts` to determine. **Step 2: Run** → pass (STOP on a real bug — co-parent access is a sensitive boundary). **Step 3: Commit** `test(web/family): co-parent invite → accept → access grant → remove`.

---

### Task 5: `healthy-use` — limits get/update (upsert regression) + effective merge

**Files:** Test: `apps/web/src/lib/server/services/healthy-use.integration.test.ts`

**Service (read `healthy-use.ts`):** `getAdminLimits()` (falls back to product defaults when the singleton row is absent), `updateAdminLimits(req)` (the UPSERT fixed in PR #24 — a fresh DB has no `healthy_use_limits` row, so this must self-create), `getKidLimitsOverrides(kidId)`, `updateKidLimitsOverrides(...)`, `getKidEffectiveLimits(kidId)` (merges admin defaults with per-kid overrides, clamped).

**Behaviors to pin (this locks in the PR #24 fix as a regression guard):**
- On a fresh DB (no singleton row), `updateAdminLimits(validLimits)` SUCCEEDS (upsert creates the row) and `getAdminLimits()` then returns the saved values — NOT a 500/P2025 (the pre-PR#24 bug).
- Triplet validation: an invalid triplet (min > default, or default > max) → 400 `invalid_triplet` (read the exact code).
- `getKidEffectiveLimits`: with no kid override → returns the admin defaults; with a kid override → the override wins (clamped into the admin min/max). Assert the merge.

- [ ] **Step 1: Write the test** (fresh-DB upsert-persists + triplet-400 + effective-merge). **Step 2: Run** → pass. If `updateAdminLimits` 500s on a fresh DB, the PR#24 upsert fix regressed — STOP and report. **Step 3: Commit** `test(web/healthy-use): admin-limits upsert-persists on fresh DB, triplet validation, effective-limits merge`.

---

### Task 6: `bundles` — serves confirmed content + version handling

**Files:** Test: `apps/web/src/lib/server/services/bundles.integration.test.ts`

**Service (read `bundles.ts`):** `getManifest()`, `getBundle(module, version?)`. Serves the latest published `ContentBundleVersion` snapshot, or the live `confirmed` pool at version 0 when nothing's published (per the route doc). Filters `status: 'confirmed'`.

**Behaviors to pin:**
- Seed a curriculum + a couple `confirmed` questions for a module (use `createCurriculum`/`createQuestion` from `@gabee/db/testing`, status confirmed) and, if needed, a `ContentBundleVersion` row. `getBundle(module)` returns those confirmed questions (candidate/rejected excluded).
- Without a published version, `getBundle` returns the live confirmed pool at version 0 (assert the version + that only confirmed questions appear).
- `getManifest` lists the modules/versions available.

- [ ] **Step 1: Write the test** (seed confirmed vs candidate questions; assert getBundle returns only confirmed + the version semantics). **Step 2: Run** → pass. **Step 3: Commit** `test(web/bundles): serves confirmed pool, excludes candidates, version-0 fallback`.

---

### Task 7: Full pipeline + PR

- [ ] **Step 1: Full local pipeline**

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration
```
Expected: green (web integration grew by 6 files). e2e is unaffected (no e2e in 5a) but CI runs it. Any FAILURE = STOP and report.

- [ ] **Step 2: Push and PR**

```bash
git push -u origin feature/test-parent-admin-surfaces
gh pr create --base main --title "test(parent-data): phase 5a — profiles/gifts/messages/family/healthy-use/bundles integration" --body "Implements phase 5a of docs/superpowers/specs/2026-07-14-test-strategy-design.md (parent/admin surfaces — the parent-facing Layer-2 data services the spec names).

- profiles: child CRUD + cross-parent ownership boundary + child limit
- gifts: grant → pending → claim lifecycle, ownership, claimed-gift star evidence (ties to the PR #24 evidence cap)
- messages: parent↔kid send/read/delete + ownership
- family: co-parent invite → accept → access grant → remove
- healthy-use: admin-limits upsert-persists on a fresh DB (regression guard for the PR #24 fix), triplet validation, effective-limits merge
- bundles: serves the confirmed pool, excludes candidates, version-0 fallback

Every service asserts its cross-family ownership boundary. Zero production changes. Phase 5b (admin content plan/pool/publish integration + admin management e2e) is planned next."
```

- [ ] **Step 3: Watch CI to green** — `gh run list --branch feature/test-parent-admin-surfaces --limit 1`, then `gh run watch <id> --exit-status`. Both `check` and `e2e` must pass. Iterate; never fire-and-forget.

---

## Self-Review (done at plan-writing time)

- **Spec coverage (phase 5a):** the Layer-2 item-4 parent services `bundles, profiles, healthy-use, family, gifts, messages` each get a focused integration test (Tasks 1-6). The admin-* Layer-2/Layer-3 surface + the admin content plan/pool/publish e2e are deliberately deferred to plan 5b (declared in Architecture). Lower-risk admin analytics services (funnels/observability/digest/frontdesk) are read-only reporting and out of the spec's named Layer-2 list — not scoped here.
- **Placeholders:** each task names the exact service file to read for signatures and pins the behaviors + the ownership boundary; the test skeletons follow the established integration pattern. The `createProfile` body/`grantGift` input/`family` token shapes are read from source (named per task) rather than guessed — the assertions (ownership, lifecycle, the healthy-use upsert regression) are the contract.
- **Type consistency:** every task reuses `createTestClient`/`resetDb`/`createParent`/`createChild`/`createLoginableParent`/`HttpError`; the healthy-use task cross-references the PR #24 upsert; the gifts task cross-references `countEvidencedStars`.
- **Known risk register:** (1) a service may reveal a real ownership/behavior bug — each task says STOP-and-report, not weaken; (2) family invite tokens may be sha256-stored — Task 4 handles via seed-known-token or the returned token; (3) gabee_test migration drift — Global Constraints give the `db:migrate:test` fix; (4) the child-limit cap may be large/awkward to hit — Task 1 makes that sub-test conditional on a deterministically-reachable cap.
