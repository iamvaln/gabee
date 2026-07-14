# Test Foundations (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the test infrastructure every later phase depends on: glob test discovery, c8 coverage, a real test Postgres with factories, a Postgres service in CI, and a pre-push hook.

**Architecture:** No new test framework — everything stays on Node's built-in runner (`node --import tsx --test`), per the approved spec (`docs/superpowers/specs/2026-07-14-test-strategy-design.md`). This phase adds: (1) glob-based discovery so new test files run without editing package.json; (2) `c8` coverage scripts per package; (3) a `@gabee/db/testing` entry exporting a test Prisma client, a `resetDb()` truncation helper and data factories, proven by a smoke integration test against a real `gabee_test` database; (4) CI gains a `postgres:14` service and a `test:integration` turbo task; (5) lefthook `pre-push` running lint + typecheck + unit tests only.

**Tech Stack:** pnpm workspaces + Turborepo, node:test + tsx, c8, Prisma 7 (`@prisma/adapter-pg`), Postgres 14, lefthook, GitHub Actions.

## Global Constraints

- Node 20 (`engines: >=20.18.0`) — native `--test-coverage-*` threshold flags need Node 22+, hence c8.
- **Never add `Co-Authored-By`/AI-attribution trailers to commits or PR bodies** (user rule, overrides tool defaults).
- Never put real secrets in tracked `.env.*.example` files. `TEST_DATABASE_URL` defaults to a local trust-auth URL and is safe; overrides go in gitignored `packages/db/.env`.
- Test-file naming convention (kid app): `*.test.ts` = pure logic (no DOM), `*.test.tsx` = DOM/component (jsdom via `src/test/setup-dom.ts`). All existing files already follow it.
- Local Postgres: Homebrew Postgres 14, trust auth as OS user on `:5432` (dev DB `gabee` already exists; this plan adds `gabee_test`).
- Work on a fresh branch off `main` named `feat/test-foundations` (do NOT reuse another session's branch name).
- Run all commands from the repo root `/Users/valentine/dev/gabee` unless the command says otherwise.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Create the branch**

```bash
git fetch origin && git switch -c feat/test-foundations origin/main
```

Expected: `branch 'feat/test-foundations' set up to track 'origin/main'`.

---

### Task 1: Glob test discovery + wire DOM tests into the pipeline

Today `apps/kid` lists test files **by name** in package.json (a new test file silently never runs), `apps/web`'s find misses `.tsx`, and kid's `test:dom` script is not part of `turbo run test` — DOM tests never run in CI.

**Files:**
- Modify: `apps/kid/package.json` (scripts `test`, `test:dom`)
- Modify: `apps/web/package.json` (script `test`)
- Modify: `package.json` (root — script `test`)
- Modify: `turbo.json` (add `test:dom` task)

**Interfaces:**
- Produces: `pnpm run test` at root = `turbo run test test:dom` (unit + DOM everywhere). Convention consumed by every later phase: drop a `*.test.ts` / `*.test.tsx` file anywhere under `src/` and it runs.

- [ ] **Step 1: Switch kid scripts to glob discovery**

In `apps/kid/package.json`, replace the `test` and `test:dom` scripts with:

```json
"test": "files=$(find src -name '*.test.ts'); if [ -z \"$files\" ]; then echo 'no unit test files found' >&2; exit 1; fi; node --import tsx --test $files",
"test:dom": "files=$(find src -name '*.test.tsx'); if [ -z \"$files\" ]; then echo 'no DOM test files found' >&2; exit 1; fi; node --import tsx --test --test-force-exit $files",
```

- [ ] **Step 2: Fix web discovery to include future `.tsx` tests**

In `apps/web/package.json`, replace the `test` script with:

```json
"test": "files=$(find src \\( -name '*.test.ts' -o -name '*.test.tsx' \\)); if [ -z \"$files\" ]; then echo 'no test files found' >&2; exit 1; fi; node --import tsx --test $files",
```

- [ ] **Step 3: Wire `test:dom` into turbo + root**

In `turbo.json`, add after the `test` task:

```json
"test:dom": {
  "dependsOn": ["^build"]
},
```

In the root `package.json`, change the `test` script to:

```json
"test": "turbo run test test:dom",
```

- [ ] **Step 4: Verify — same suites still run**

```bash
pnpm run test
```

Expected: turbo runs `test` in kid (18 tests), web (3 files) and types, **plus** `test:dom` in kid (9 tests). All pass. Packages without the script are skipped by turbo without error.

- [ ] **Step 5: Prove the trap is dead with a canary file**

```bash
cat > apps/kid/src/lib/__glob-canary.test.ts <<'EOF'
import test from 'node:test';
import assert from 'node:assert/strict';

test('glob discovery picks up new test files', () => {
  assert.equal(1 + 1, 2);
});
EOF
pnpm --filter kid run test 2>&1 | grep -c 'glob discovery picks up'
rm apps/kid/src/lib/__glob-canary.test.ts
```

Expected: grep prints a non-zero count (the canary ran without touching package.json). Note: check the kid package's actual `name` field if `--filter kid` doesn't match (use `--filter @gabee/kid` or the directory filter `--filter ./apps/kid`).

- [ ] **Step 6: Commit**

```bash
git add apps/kid/package.json apps/web/package.json package.json turbo.json
git commit -m "test(infra): glob test discovery everywhere; run kid DOM tests in the pipeline"
```

---

### Task 2: c8 coverage scripts

**Files:**
- Modify: `apps/kid/package.json`, `apps/web/package.json`, `packages/types/package.json` (add `c8` devDep + `test:coverage` script)
- Modify: `turbo.json`, root `package.json` (`test:coverage` task/script)
- Modify: `.gitignore` (ignore `coverage/`)

**Interfaces:**
- Produces: `pnpm run test:coverage` (root or per package) → text summary + `coverage/lcov.info` + HTML report per package. Phase 6 will build `c8 check-coverage` thresholds on top of these exact scripts.

- [ ] **Step 1: Add c8 to the three test-bearing packages**

```bash
pnpm --filter ./apps/kid --filter ./apps/web --filter ./packages/types add -D c8
```

- [ ] **Step 2: Add `test:coverage` scripts**

`apps/kid/package.json` (covers the unit suite only — `--test-force-exit` in the DOM suite kills the process before V8 flushes coverage, a known limitation noted in the spec):

```json
"test:coverage": "c8 -r text -r lcov -r html -x '**/*.test.*' -x 'src/test/**' pnpm run test",
```

`apps/web/package.json`:

```json
"test:coverage": "c8 -r text -r lcov -r html -x '**/*.test.*' pnpm run test",
```

`packages/types/package.json`:

```json
"test:coverage": "c8 -r text -r lcov -r html -x 'test/**' pnpm run test",
```

- [ ] **Step 3: Wire into turbo + root + gitignore**

`turbo.json`, after `test:dom`:

```json
"test:coverage": {
  "dependsOn": ["^build"],
  "outputs": ["coverage/**"]
},
```

Root `package.json`, after `test`:

```json
"test:coverage": "turbo run test:coverage",
```

`.gitignore`: add a line `coverage/` (skip if already present).

- [ ] **Step 4: Verify**

```bash
pnpm --filter ./packages/types run test:coverage
```

Expected: tests pass, then a c8 table ending with an "All files" row around 99 % lines, and `packages/types/coverage/lcov.info` exists.

```bash
pnpm --filter ./apps/kid run test:coverage
```

Expected: 18 tests pass, c8 table shows `src/lib` files (turtle ~51 %, guide ~41 % — same ballpark as the spec's baseline).

- [ ] **Step 5: Commit**

```bash
git add apps/kid/package.json apps/web/package.json packages/types/package.json turbo.json package.json .gitignore pnpm-lock.yaml
git commit -m "test(infra): c8 coverage scripts per package (lcov + html + text)"
```

---

### Task 3: Test Postgres + `@gabee/db/testing` (client, resetDb, factories)

The heart of the phase. TDD: the smoke test is written first and drives the helper module.

**Files:**
- Create: `packages/db/src/testing.ts`
- Create: `packages/db/test/testing.test.ts`
- Modify: `packages/db/package.json` (exports map, `test:integration` + `db:migrate:test` scripts)
- Modify: `turbo.json`, root `package.json` (`test:integration`)

**Interfaces:**
- Consumes: `createPrismaClient`-style adapter setup from `packages/db/src/client.ts` (`new PrismaPg({ connectionString })` → `new PrismaClient({ adapter })`); generated client + `Prisma` input types from `packages/db/src/generated/prisma/client`.
- Produces (all later phases import these from `@gabee/db/testing`):
  - `createTestClient(connectionString?: string): PrismaClient` — defaults to `process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/gabee_test'`.
  - `resetDb(prisma: PrismaClient): Promise<void>` — truncates every public table except `_prisma_migrations`.
  - `createParent(prisma, overrides?) → ParentAccount` (unique email per call)
  - `createChild(prisma, overrides?) → ChildProfile` (auto-creates a parent unless `parentId` given; `language` defaults `'fr'`)
  - `createCurriculum(prisma, overrides?) → Curriculum`
  - `createQuestion(prisma, overrides?) → Question` (auto-creates a curriculum unless `curriculumId` given; defaults: module `numbers`, level 1, lesson 1, type `mcq-number`)
  - `createDevice(prisma, overrides?) → Device` (auto-creates a parent unless `parentId` given)

- [ ] **Step 1: Create the local test database and migrate it**

```bash
createdb gabee_test 2>/dev/null || echo "gabee_test already exists"
```

Add to `packages/db/package.json` scripts (the `DIRECT_URL` override wins over the `.env` value loaded by `prisma.config.ts` because `dotenv` never overwrites existing env vars):

```json
"db:migrate:test": "DIRECT_URL=\"${TEST_DATABASE_URL:-postgresql://localhost:5432/gabee_test}\" prisma migrate deploy",
```

Run it:

```bash
pnpm --filter @gabee/db run db:migrate:test
```

Expected: `21 migrations found`, all applied (or "No pending migrations").

- [ ] **Step 2: Write the failing smoke test**

Create `packages/db/test/testing.test.ts`:

```ts
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestClient,
  resetDb,
  createParent,
  createChild,
  createCurriculum,
  createQuestion,
  createDevice,
} from '../src/testing';

const prisma = createTestClient();

before(async () => {
  await resetDb(prisma);
});
beforeEach(async () => {
  await resetDb(prisma);
});
after(async () => {
  await prisma.$disconnect();
});

test('createParent → unique emails, default parent role', async () => {
  const a = await createParent(prisma);
  const b = await createParent(prisma);
  assert.notEqual(a.email, b.email);
  assert.equal(a.role, 'parent');
});

test('createChild auto-creates a parent and links to it', async () => {
  const child = await createChild(prisma);
  const found = await prisma.childProfile.findUniqueOrThrow({
    where: { id: child.id },
    include: { parent: true },
  });
  assert.equal(found.parent.id, child.parentId);
  assert.equal(found.language, 'fr');
});

test('createChild respects an explicit parentId', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  assert.equal(child.parentId, parent.id);
});

test('createQuestion auto-creates a curriculum; overrides win', async () => {
  const q = await createQuestion(prisma, { module: 'words', level: 3 });
  assert.equal(q.module, 'words');
  assert.equal(q.level, 3);
  const cur = await prisma.curriculum.findUniqueOrThrow({ where: { id: q.curriculumId } });
  assert.ok(cur.id);
});

test('createDevice auto-creates a parent', async () => {
  const device = await createDevice(prisma);
  const parent = await prisma.parentAccount.findUniqueOrThrow({ where: { id: device.parentId } });
  assert.ok(parent.id);
});

test('createCurriculum creates a row', async () => {
  const cur = await createCurriculum(prisma);
  assert.equal(await prisma.curriculum.count({ where: { id: cur.id } }), 1);
});

test('resetDb truncates everything except _prisma_migrations', async () => {
  await createChild(prisma);
  await createQuestion(prisma);
  await resetDb(prisma);
  assert.equal(await prisma.parentAccount.count(), 0);
  assert.equal(await prisma.childProfile.count(), 0);
  assert.equal(await prisma.question.count(), 0);
  // migrations table untouched — the client still works against a migrated schema
  const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM _prisma_migrations
  `;
  assert.ok(count > 0n);
});
```

- [ ] **Step 3: Run it — must fail (module doesn't exist)**

```bash
cd packages/db && node --import tsx --test test/testing.test.ts; cd ../..
```

Expected: FAIL — `Cannot find module '../src/testing'`.

- [ ] **Step 4: Implement `packages/db/src/testing.ts`**

```ts
/**
 * Test-only helpers: a Prisma client bound to the test database, a truncation
 * reset, and data factories. Imported as `@gabee/db/testing` by integration
 * and e2e suites. NEVER import this from app runtime code.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client';

export function createTestClient(
  connectionString: string = process.env.TEST_DATABASE_URL ??
    'postgresql://localhost:5432/gabee_test',
): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** Truncate every public table except _prisma_migrations (schema survives, data goes). */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

// Monotonic per-process suffix so factory rows never collide on unique columns.
let seq = 0;
function uniq(): string {
  seq += 1;
  return `${process.pid}-${seq}`;
}

export async function createParent(
  prisma: PrismaClient,
  overrides: Partial<Prisma.ParentAccountUncheckedCreateInput> = {},
) {
  return prisma.parentAccount.create({
    data: { email: `parent-${uniq()}@test.gabee.local`, ...overrides },
  });
}

export async function createChild(
  prisma: PrismaClient,
  overrides: Partial<Prisma.ChildProfileUncheckedCreateInput> = {},
) {
  const parentId = overrides.parentId ?? (await createParent(prisma)).id;
  return prisma.childProfile.create({
    data: { name: `Kid ${uniq()}`, language: 'fr', ...overrides, parentId },
  });
}

export async function createCurriculum(
  prisma: PrismaClient,
  overrides: Partial<Prisma.CurriculumUncheckedCreateInput> = {},
) {
  return prisma.curriculum.create({
    data: { name: `Test curriculum ${uniq()}`, ...overrides },
  });
}

export async function createQuestion(
  prisma: PrismaClient,
  overrides: Partial<Prisma.QuestionUncheckedCreateInput> = {},
) {
  const curriculumId = overrides.curriculumId ?? (await createCurriculum(prisma)).id;
  return prisma.question.create({
    data: {
      id: `q-test-${uniq()}`,
      module: 'numbers',
      level: 1,
      lesson: 1,
      theme: 'test',
      type: 'mcq-number',
      prompt: { text: '2 + 2 ?' },
      answer: 4,
      distractors: [3, 5],
      difficulty: 1,
      createdBy: 'factory',
      ...overrides,
      curriculumId,
    },
  });
}

export async function createDevice(
  prisma: PrismaClient,
  overrides: Partial<Prisma.DeviceUncheckedCreateInput> = {},
) {
  const parentId = overrides.parentId ?? (await createParent(prisma)).id;
  return prisma.device.create({
    data: { deviceId: `dev-${uniq()}`, uaFull: 'factory-test-agent', ...overrides, parentId },
  });
}
```

- [ ] **Step 5: Expose the `./testing` export + `test:integration` script**

In `packages/db/package.json`, extend `exports`:

```json
"exports": {
  ".": {
    "types": "./src/index.ts",
    "default": "./src/index.ts"
  },
  "./testing": {
    "types": "./src/testing.ts",
    "default": "./src/testing.ts"
  }
},
```

and add the script:

```json
"test:integration": "files=$(find test -name '*.test.ts'); if [ -z \"$files\" ]; then echo 'no integration test files found' >&2; exit 1; fi; node --import tsx --test $files",
```

- [ ] **Step 6: Run — must pass**

```bash
pnpm --filter @gabee/db run test:integration
```

Expected: PASS — 7 tests, 0 fail.

- [ ] **Step 7: Wire `test:integration` into turbo + root**

`turbo.json`, after `test:coverage` (own-package `build` = `prisma generate`, required for the generated client):

```json
"test:integration": {
  "dependsOn": ["build", "^build"],
  "passThroughEnv": ["TEST_DATABASE_URL", "DATABASE_URL", "DIRECT_URL"]
},
```

Root `package.json`, after `test:coverage`:

```json
"test:integration": "turbo run test:integration",
```

Note: `test:integration` is deliberately NOT part of the root `test` script — unit tests must stay runnable without a database (spec: pre-push hook has no DB).

- [ ] **Step 8: Verify typecheck still passes (exports map, new file)**

```bash
pnpm run typecheck
```

Expected: all packages pass.

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/testing.ts packages/db/test/testing.test.ts packages/db/package.json turbo.json package.json
git commit -m "test(db): @gabee/db/testing — test client, resetDb, factories + smoke integration suite"
```

---

### Task 4: Postgres service in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `db:migrate:deploy` and the root `test:integration` script from Task 3.
- Produces: every PR runs unit + DOM + DB-integration tests against a real migrated Postgres. Phase 2+ integration suites get CI coverage for free.

- [ ] **Step 1: Edit `ci.yml`**

In the `check` job, replace the `env` block (the throwaway `DIRECT_URL`) with real service URLs, and add the service:

```yaml
  check:
    runs-on: ubuntu-latest
    # Real Postgres service: `prisma migrate deploy` + the test:integration turbo task
    # run against it. DIRECT_URL doubles as the migrate URL (prisma.config.ts reads it).
    env:
      DIRECT_URL: postgresql://postgres:postgres@localhost:5432/gabee_test
      TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/gabee_test
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: gabee_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
```

Then, after the existing `Prisma generate` step, add:

```yaml
      - name: Migrate test DB
        run: pnpm --filter @gabee/db run db:migrate:deploy
```

And after the existing `Test` step, add:

```yaml
      - name: Integration tests
        run: pnpm run test:integration
```

- [ ] **Step 2: Commit and push the branch**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: postgres service + migrate + integration-test step"
git push -u origin feat/test-foundations
```

- [ ] **Step 3: Watch the run to green (do not fire-and-forget)**

```bash
gh run list --branch feat/test-foundations --limit 1
gh run watch <run-id> --exit-status
```

Expected: exit 0 — lint, typecheck, unit + DOM tests, migrate, integration tests all green. If it fails, read the log (`gh run view <run-id> --log-failed`), fix, push again, re-watch.

---

### Task 5: lefthook pre-push hook

**Files:**
- Create: `lefthook.yml`
- Modify: `package.json` (root — devDep + `prepare` script)

**Interfaces:**
- Produces: every `git push` runs lint + typecheck + unit/DOM tests locally (< 30 s target). No DB, no e2e in the hook (spec: cadence §2). Escape hatch: `git push --no-verify` / `LEFTHOOK=0 git push`.

- [ ] **Step 1: Install lefthook and register hooks on install**

```bash
pnpm add -D -w lefthook
```

In root `package.json` scripts, add:

```json
"prepare": "lefthook install",
```

- [ ] **Step 2: Create `lefthook.yml`**

```yaml
# Pre-push quality gate: fast checks only (lint + types + unit/DOM tests).
# DB-integration and e2e suites run in CI, not here (they need Postgres/browsers).
# Skip in a pinch: `git push --no-verify` or `LEFTHOOK=0 git push`.
pre-push:
  parallel: true
  jobs:
    - name: lint
      run: pnpm run lint
    - name: typecheck
      run: pnpm run typecheck
    - name: unit tests
      run: pnpm run test
```

- [ ] **Step 3: Register and verify the hook runs**

```bash
pnpm run prepare
npx lefthook run pre-push
```

Expected: `lefthook install` writes `.git/hooks/pre-push`; the run executes the three jobs in parallel and all pass. Time the run — it should be well under 30 s (turbo caches unchanged packages).

- [ ] **Step 4: Commit and push (the push itself exercises the hook)**

```bash
git add lefthook.yml package.json pnpm-lock.yaml
git commit -m "chore(hooks): lefthook pre-push — lint + typecheck + unit tests"
git push
```

Expected: lefthook output appears before the push proceeds; CI goes green again (`gh run watch <id> --exit-status`).

---

### Task 6: Phase-1 wrap-up — PR

**Files:** none

- [ ] **Step 1: Open the PR against main**

```bash
gh pr create --base main --title "test(infra): phase 1 foundations — glob discovery, c8, test DB + factories, CI postgres, lefthook" --body "Implements phase 1 (Foundations) of docs/superpowers/specs/2026-07-14-test-strategy-design.md.

- Glob test discovery everywhere (kills the listed-by-name trap); kid DOM tests now run in CI
- c8 test:coverage scripts (kid / web / types)
- @gabee/db/testing: createTestClient, resetDb, factories (parent, child, curriculum, question, device) + smoke integration suite against a real gabee_test Postgres
- CI: postgres:14 service, migrate deploy, integration-test step
- lefthook pre-push: lint + typecheck + unit tests

Phase 2 (offline core: sync.ts/db.ts unit + progress-merge/events integration + kid offline e2e) is planned next."
```

Expected: PR URL printed. (No AI-attribution trailer in the body.)

---

## Self-Review (done at plan-writing time)

- **Spec coverage (phase 1 items):** glob discovery ✔ (Task 1), c8 scripts ✔ (Task 2), `gabee_test` + factories + `resetDb` ✔ (Task 3), Postgres service in CI ✔ (Task 4), lefthook ✔ (Task 5). Spec's `TEST_DATABASE_URL` name ✔ used consistently.
- **Placeholders:** none — every step has exact code/commands.
- **Type consistency:** `createTestClient`/`resetDb`/factory names identical in test (Task 3 Step 2), implementation (Step 4), exports (Step 5) and later-phase interface notes.
- **Known deviations:** none from the spec. DOM-suite coverage exclusion (force-exit) is documented in both spec and Task 2.
