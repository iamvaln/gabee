# Offline Core Tests (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the product's #1 risk — the offline sync pipeline — under test: kid-side `SyncManager`/Dexie queues (unit) and web-side monotonic progress merge + idempotent event ingestion (integration against real Postgres).

**Architecture:** Phase 2 of `docs/superpowers/specs/2026-07-14-test-strategy-design.md`, split in two: **2a (this plan)** = unit + DB/route integration; **2b (next plan)** = Playwright bootstrap + the kid offline e2e scenario. Kid unit tests run in the existing jsdom DOM suite (they need `fake-indexeddb` + `window`); web integration tests get a new `*.integration.test.ts` convention, excluded from the unit glob and run by a `test:integration` script against `gabee_test`, reusing `@gabee/db/testing` factories.

**Tech Stack:** node:test (+ `mock.method`, `mock.timers`) via tsx, global-jsdom + fake-indexeddb (kid), `@gabee/db/testing` + Postgres 14 (web), jose session JWT (route-level test).

## Global Constraints

- **Never add `Co-Authored-By`/AI-attribution trailers to commits or PR bodies** (user rule).
- Test naming: kid `*.test.ts` = pure unit, `*.test.tsx` = DOM suite (jsdom via `import '<rel>/test/setup-dom'` FIRST). Web: `*.integration.test.ts` = DB-backed; plain `*.test.ts` = unit.
- Integration tests: serialize files with `--test-concurrency=1`; never point at a DB whose name doesn't end in `_test` (`resetDb` throws otherwise, by design).
- **The spec's Layer-2 wording "last-write-wins" is outdated** — the shipped implementation (`progress-merge.ts`, `progress.ts`) is a *monotonic merge* (max stars/plays/levels, min best_time, union seen-ids/badges) under a `FOR UPDATE` row lock. Tests verify the monotonic behavior. Task 7 updates the spec wording.
- Node 20, pnpm, repo root = the worktree root. Work on branch `feature/test-offline-core` off `origin/main`.
- `sync.ts` public surface must not change (app code keeps importing the `sync` singleton); adding `export` to the class is the only allowed API change.

---

### Task 0: Branch

- [ ] **Step 1:** Worktree/branch `feature/test-offline-core` off `origin/main` (handled by the worktree tooling at execution time; verify with `git status -sb` and `git merge-base --is-ancestor HEAD origin/main`).

---

### Task 1: SyncManager drain semantics (unit, DOM suite)

**Files:**
- Modify: `apps/kid/src/lib/sync.ts` (line 36: `class SyncManager` → `export class SyncManager`; nothing else)
- Test: `apps/kid/src/lib/sync.drain.test.tsx`

**Interfaces:**
- Consumes: `db` (Dexie, fake-indexeddb), `api` object from `apps/kid/src/lib/api.ts` (`api.ingestEvents`, `api.syncProgress`, `ApiError`), `SyncManager` (new export).
- Produces: the mocking pattern (`mock.method(api, ...)` + fresh `new SyncManager()` per test + `navigator.onLine` override) that Task 2 reuses.

- [ ] **Step 1: Write the failing test**

```tsx
import './../test/setup-dom'; // MUST be first: jsdom + fake-indexeddb
import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db';
import { api, ApiError } from './api';
import { SyncManager } from './sync';

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

function envelope(i: number) {
  // Shape per EventEnvelopeSchema (@gabee/types); uuid v4 from the browser crypto.
  return {
    event_id: crypto.randomUUID(),
    profile_id: null,
    session_id: null,
    client_ts: new Date(2026, 0, 1, 0, 0, i % 60).toISOString(),
    schema_version: 1,
    event: { name: 'app_open' },
  };
}

beforeEach(async () => {
  setOnline(true);
  mock.restoreAll();
  await db.events.clear();
  await db.progress.clear();
});

test('flush drains queued events in batches of ≤500 and deletes confirmed rows', async () => {
  const calls: number[] = [];
  mock.method(api, 'ingestEvents', async (envs: unknown[]) => {
    calls.push(envs.length);
    return { accepted: envs.length, duplicates: 0, rejected: [] };
  });
  mock.method(api, 'syncProgress', async () => ({}));
  await db.events.bulkAdd(Array.from({ length: 501 }, (_, i) => ({ envelope: envelope(i) })) as never);

  await new SyncManager().flush();

  assert.deepEqual(calls, [500, 1]); // two batches, capped at MAX_BATCH
  assert.equal(await db.events.count(), 0); // confirmed rows removed
});

test('duplicates and rejected are still removed from the queue (no re-send loop)', async () => {
  mock.method(api, 'ingestEvents', async (envs: { event_id: string }[]) => ({
    accepted: 0,
    duplicates: envs.length - 1,
    rejected: [envs[0]!.event_id],
  }));
  mock.method(api, 'syncProgress', async () => ({}));
  await db.events.bulkAdd([{ envelope: envelope(1) }, { envelope: envelope(2) }] as never);

  await new SyncManager().flush();

  assert.equal(await db.events.count(), 0);
});

test('transient failure keeps every row queued', async () => {
  mock.method(api, 'ingestEvents', async () => {
    throw new ApiError(500, 'boom', 'server exploded');
  });
  await db.events.bulkAdd([{ envelope: envelope(1) }, { envelope: envelope(2) }] as never);

  await new SyncManager().flush(); // swallows the error, schedules retry

  assert.equal(await db.events.count(), 2);
});

test('queueProgress keeps ONE row per profile (latest snapshot replaces)', async () => {
  setOnline(false); // block flushing so we can observe the queue itself
  const m = new SyncManager();
  const pid = crypto.randomUUID();
  await m.queueProgress({ profile_id: pid, total_stars: 1 } as never);
  await m.queueProgress({ profile_id: pid, total_stars: 7 } as never);

  const rows = await db.progress.toArray();
  assert.equal(rows.length, 1);
  assert.equal((rows[0]!.body as { total_stars: number }).total_stars, 7);
});

test('progress: 4xx (non-auth) drops the snapshot; 401 keeps it', async () => {
  mock.method(api, 'ingestEvents', async () => ({ accepted: 0, duplicates: 0, rejected: [] }));
  const p1 = crypto.randomUUID();
  const p2 = crypto.randomUUID();
  await db.progress.bulkPut([
    { profile_id: p1, body: { profile_id: p1 } },
    { profile_id: p2, body: { profile_id: p2 } },
  ] as never);
  mock.method(api, 'syncProgress', async (body: { profile_id: string }) => {
    if (body.profile_id === p1) throw new ApiError(422, 'invalid', 'permanently invalid');
    throw new ApiError(401, 'unauthorized', 'token expired');
  });

  await new SyncManager().flush();

  const left = await db.progress.toArray();
  assert.deepEqual(left.map((r) => r.profile_id), [p2]); // 422 dropped, 401 kept
});

test('flush while offline drains nothing and reports offline', async () => {
  setOnline(false);
  const ingest = mock.method(api, 'ingestEvents', async () => ({ accepted: 0, duplicates: 0, rejected: [] }));
  await db.events.add({ envelope: envelope(1) } as never);
  const m = new SyncManager();

  await m.flush();

  assert.equal(ingest.mock.callCount(), 0);
  assert.equal(await db.events.count(), 1);
  assert.equal(m.getStatus(), 'offline');
});
```

Adjust `envelope()`/`ApiError` construction to the real signatures in `apps/kid/src/lib/api.ts` if they differ (e.g. `ApiError(status, code, message)` argument order) — the assertions are the contract, keep them intact.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/kid && node --import tsx --test --test-force-exit src/lib/sync.drain.test.tsx`
Expected: FAIL — `SyncManager` is not exported (only the `sync` singleton is).

- [ ] **Step 3: Minimal implementation**

In `apps/kid/src/lib/sync.ts` line 36: `class SyncManager {` → `export class SyncManager {`. No other change.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/kid && node --import tsx --test --test-force-exit src/lib/sync.drain.test.tsx`
Expected: PASS (6/6). Then run the full kid suites from the repo root: `pnpm --filter @gabee/kid run test && pnpm --filter @gabee/kid run test:dom` — the glob picks the new file up automatically; everything green.

- [ ] **Step 5: Commit**

```bash
git add apps/kid/src/lib/sync.ts apps/kid/src/lib/sync.drain.test.tsx
git commit -m "test(kid/sync): drain semantics — batching, confirmed-row removal, transient retention, LWW progress queue"
```

---

### Task 2: SyncManager scheduling & status (unit, DOM suite)

**Files:**
- Test: `apps/kid/src/lib/sync.schedule.test.tsx`

**Interfaces:**
- Consumes: the Task-1 pattern (`export class SyncManager`, `mock.method(api, ...)`, `setOnline`).
- Produces: nothing new — closes the unit coverage of `sync.ts`.

- [ ] **Step 1: Write the failing test**

```tsx
import './../test/setup-dom';
import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db';
import { api, ApiError } from './api';
import { SyncManager } from './sync';

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(async () => {
  setOnline(true);
  mock.restoreAll();
  mock.timers.reset();
  await db.events.clear();
  await db.progress.clear();
});

test('exponential backoff: retries at 2s, then 4s, capped growth', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fail = true;
  const ingest = t.mock.method(api, 'ingestEvents', async () => {
    if (fail) throw new ApiError(500, 'boom', 'transient');
    return { accepted: 1, duplicates: 0, rejected: [] };
  });
  t.mock.method(api, 'syncProgress', async () => ({}));
  await db.events.add({ envelope: { event_id: crypto.randomUUID(), profile_id: null, session_id: null, client_ts: new Date(2026, 0, 1).toISOString(), schema_version: 1, event: { name: 'app_open' } } } as never);
  const m = new SyncManager();

  await m.flush(); // failure #1 → retry in 2s
  assert.equal(ingest.mock.callCount(), 1);

  t.mock.timers.tick(1_999);
  assert.equal(ingest.mock.callCount(), 1); // not yet
  t.mock.timers.tick(1);
  await Promise.resolve(); // let the retry flush start
  await new Promise((r) => setImmediate(r)); // and finish its async chain
  assert.equal(ingest.mock.callCount(), 2); // failure #2 → retry in 4s

  t.mock.timers.tick(3_999);
  await new Promise((r) => setImmediate(r));
  assert.equal(ingest.mock.callCount(), 2);
  fail = false;
  t.mock.timers.tick(1);
  await new Promise((r) => setImmediate(r));
  assert.equal(ingest.mock.callCount(), 3); // recovered
  assert.equal(await db.events.count(), 0);
});

test('single-flight: concurrent flush calls coalesce into one drain', async () => {
  let resolveIngest!: () => void;
  const gate = new Promise<void>((r) => (resolveIngest = r));
  const ingest = mock.method(api, 'ingestEvents', async () => {
    await gate;
    return { accepted: 1, duplicates: 0, rejected: [] };
  });
  mock.method(api, 'syncProgress', async () => ({}));
  await db.events.add({ envelope: { event_id: crypto.randomUUID(), profile_id: null, session_id: null, client_ts: new Date(2026, 0, 1).toISOString(), schema_version: 1, event: { name: 'app_open' } } } as never);
  const m = new SyncManager();

  const first = m.flush();
  const second = m.flush(); // must return immediately (inFlight)
  await second;
  assert.equal(ingest.mock.callCount(), 1);
  resolveIngest();
  await first;
  assert.equal(ingest.mock.callCount(), 1);
});

test('syncNow reports offline / busy / success with pending count', async () => {
  mock.method(api, 'ingestEvents', async () => ({ accepted: 2, duplicates: 0, rejected: [] }));
  mock.method(api, 'syncProgress', async () => ({}));
  const m = new SyncManager();

  setOnline(false);
  assert.deepEqual(await m.syncNow(), { ok: false, sentEvents: 0, reason: 'offline' });

  setOnline(true);
  await db.events.bulkAdd([
    { envelope: { event_id: crypto.randomUUID(), profile_id: null, session_id: null, client_ts: new Date(2026, 0, 1).toISOString(), schema_version: 1, event: { name: 'app_open' } } },
    { envelope: { event_id: crypto.randomUUID(), profile_id: null, session_id: null, client_ts: new Date(2026, 0, 1).toISOString(), schema_version: 1, event: { name: 'app_open' } } },
  ] as never);
  const res = await m.syncNow();
  assert.equal(res.ok, true);
  assert.equal(res.sentEvents, 2);
});

test('status: syncing while draining, synced flash after a real push, then online', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(api, 'ingestEvents', async () => ({ accepted: 1, duplicates: 0, rejected: [] }));
  t.mock.method(api, 'syncProgress', async () => ({}));
  await db.events.add({ envelope: { event_id: crypto.randomUUID(), profile_id: null, session_id: null, client_ts: new Date(2026, 0, 1).toISOString(), schema_version: 1, event: { name: 'app_open' } } } as never);
  const m = new SyncManager();
  const seen: string[] = [];
  m.subscribe((s) => seen.push(s));

  await m.flush();
  assert.deepEqual(seen.slice(0, 3), ['online', 'syncing', 'synced']);
  t.mock.timers.tick(2_000);
  assert.equal(m.getStatus(), 'online');
});
```

If the event-loop interleaving around `mock.timers.tick` + pending promises proves flaky under node:test, replace the `setImmediate` waits with `await t.mock.timers.tickAsync?.(ms)` if available on Node 20, or poll `ingest.mock.callCount()` in a microtask loop bounded at 50 iterations — do NOT add real `setTimeout` sleeps.

- [ ] **Step 2: Run to verify it fails** — it should actually PASS immediately if Task 1 landed (no production change in this task). Run it BEFORE writing any adjustment: `cd apps/kid && node --import tsx --test --test-force-exit src/lib/sync.schedule.test.tsx`. Expected: PASS 4/4 (this task is test-only; RED/GREEN applies to the test's own draft-debug cycle, not production code).

- [ ] **Step 3: Full suites** — `pnpm --filter @gabee/kid run test:dom` → all DOM tests pass, output pristine.

- [ ] **Step 4: Commit**

```bash
git add apps/kid/src/lib/sync.schedule.test.tsx
git commit -m "test(kid/sync): scheduling — exponential backoff, single-flight, syncNow reasons, status transitions"
```

---

### Task 3: Dexie queue semantics (unit, DOM suite)

**Files:**
- Test: `apps/kid/src/lib/db.queues.test.tsx`

**Interfaces:**
- Consumes: `db` from `apps/kid/src/lib/db.ts` on fake-indexeddb.
- Produces: nothing — pins the storage contracts `sync.ts` relies on.

- [ ] **Step 1: Write the test**

```tsx
import './../test/setup-dom';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db';

beforeEach(async () => {
  await db.events.clear();
  await db.progress.clear();
});

test('events queue preserves insertion order via auto-increment id', async () => {
  await db.events.bulkAdd([
    { envelope: { event_id: 'a' } },
    { envelope: { event_id: 'b' } },
    { envelope: { event_id: 'c' } },
  ] as never);
  const rows = await db.events.orderBy('id').toArray();
  assert.deepEqual(rows.map((r) => (r.envelope as { event_id: string }).event_id), ['a', 'b', 'c']);
});

test('progress table is keyed by profile_id — put replaces, delete removes', async () => {
  await db.progress.put({ profile_id: 'p1', body: { profile_id: 'p1', total_stars: 1 } } as never);
  await db.progress.put({ profile_id: 'p1', body: { profile_id: 'p1', total_stars: 9 } } as never);
  await db.progress.put({ profile_id: 'p2', body: { profile_id: 'p2', total_stars: 3 } } as never);
  assert.equal(await db.progress.count(), 2);

  await db.progress.delete('p1');
  const left = await db.progress.toArray();
  assert.deepEqual(left.map((r) => r.profile_id), ['p2']);
});

test('bulkDelete removes exactly the given ids and leaves the rest', async () => {
  await db.events.bulkAdd([{ envelope: { event_id: 'a' } }, { envelope: { event_id: 'b' } }, { envelope: { event_id: 'c' } }] as never);
  const rows = await db.events.orderBy('id').toArray();
  await db.events.bulkDelete(rows.slice(0, 2).map((r) => r.id));
  const left = await db.events.toArray();
  assert.deepEqual(left.map((r) => (r.envelope as { event_id: string }).event_id), ['c']);
});
```

- [ ] **Step 2: Run** — `cd apps/kid && node --import tsx --test --test-force-exit src/lib/db.queues.test.tsx` → PASS 3/3 (test-only task).

- [ ] **Step 3: Commit**

```bash
git add apps/kid/src/lib/db.queues.test.tsx
git commit -m "test(kid/db): pin Dexie queue contracts — FIFO events, keyed progress, bulkDelete scope"
```

---

### Task 4: Web integration harness + progress merge tests

**Files:**
- Create: `apps/web/src/test/setup-integration.ts`
- Test: `apps/web/src/lib/server/services/progress.integration.test.ts`
- Modify: `apps/web/package.json` (exclude `*.integration.test.ts` from `test`/`test:coverage`; add `test:integration`)
- Modify: `turbo.json` (web integration runs after db's — same shared DB)

**Interfaces:**
- Consumes: `@gabee/db/testing` (`createTestClient`, `resetDb`, `createParent`, `createChild`), `syncProgress` from `apps/web/src/lib/server/services/progress.ts`, `defaultProgressByModule` from `@gabee/types`.
- Produces: the `*.integration.test.ts` convention + `setup-integration.ts` env bootstrap that Tasks 5-6 and later phases reuse.

- [ ] **Step 1: Env bootstrap** — create `apps/web/src/test/setup-integration.ts`:

```ts
/**
 * Integration-test bootstrap. Import FIRST in every *.integration.test.ts —
 * it must run before `@/lib/server/db` (the prisma singleton reads
 * DATABASE_URL at import time) and before `env.ts` validation.
 */
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/gabee_test';
if (!process.env.DATABASE_URL.includes('_test')) {
  throw new Error(`Refusing integration tests against non-test DATABASE_URL`);
}
```

- [ ] **Step 2: Scripts** — in `apps/web/package.json`:

```json
"test": "files=$(find src \\( -name '*.test.ts' -o -name '*.test.tsx' \\) ! -name '*.integration.test.ts'); if [ -z \"$files\" ]; then echo 'no test files found' >&2; exit 1; fi; node --import tsx --test $files",
"test:coverage": "files=$(find src \\( -name '*.test.ts' -o -name '*.test.tsx' \\) ! -name '*.integration.test.ts'); if [ -z \"$files\" ]; then echo 'no test files found' >&2; exit 1; fi; c8 -r text -r lcov -r html -x '**/*.test.*' node --import tsx --test $files",
"test:integration": "files=$(find src -name '*.integration.test.ts'); if [ -z \"$files\" ]; then echo 'no integration test files found' >&2; exit 1; fi; node --import tsx --test --test-concurrency=1 $files",
```

In `turbo.json`, add below the `@gabee/db#test:integration` override (web shares `gabee_test` with db's suite — `^test:integration` serializes them since `@gabee/web` depends on `@gabee/db`):

```json
"@gabee/web#test:integration": {
  "dependsOn": ["^build", "^test:integration"],
  "cache": false,
  "passThroughEnv": ["TEST_DATABASE_URL", "DATABASE_URL", "DIRECT_URL"]
},
```

- [ ] **Step 3: Write the failing test** — `apps/web/src/lib/server/services/progress.integration.test.ts`:

```ts
import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import { defaultProgressByModule } from '@gabee/types';
import { syncProgress } from './progress';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

function numbersProgress(stars: number, highestLevel: number) {
  const p = defaultProgressByModule();
  p.numbers.highest_level = highestLevel;
  p.numbers.levels = [
    {
      level: 1,
      stars,
      plays: 1,
      best_time_s: null,
      last_played: new Date(2026, 0, 1).toISOString(),
      seen_question_ids: [`q-${stars}`],
      lessons: [{ lesson: 1, stars, plays: 1, last_played: new Date(2026, 0, 1).toISOString() }],
    },
  ];
  return p;
}

test('a stale device can never regress progress (monotonic merge)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  await syncProgress(parent.id, { profile_id: child.id, total_stars: 10, progress_by_module: numbersProgress(10, 3) } as never);
  const res = await syncProgress(parent.id, { profile_id: child.id, total_stars: 4, progress_by_module: numbersProgress(4, 1) } as never);

  assert.equal(res.total_stars, 10); // max, not clobber
  assert.equal(res.progress_by_module.numbers.highest_level, 3);
  assert.equal(res.progress_by_module.numbers.levels[0]!.stars, 10);
  // seen ids are a union — both devices' history is kept
  assert.deepEqual([...res.progress_by_module.numbers.levels[0]!.seen_question_ids].sort(), ['q-10', 'q-4']);
});

test('badges are a union — a stale device cannot strip an earned badge', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id, badges: ['first_star'] });

  const res = await syncProgress(parent.id, { profile_id: child.id, badges: ['week_streak'] } as never);

  assert.deepEqual([...res.badges].sort(), ['first_star', 'week_streak']);
});

test('two concurrent device syncs both land (row lock serializes the merge)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  await Promise.all([
    syncProgress(parent.id, { profile_id: child.id, total_stars: 5, badges: ['a'] } as never),
    syncProgress(parent.id, { profile_id: child.id, total_stars: 8, badges: ['b'] } as never),
  ]);

  const row = await prisma.childProfile.findUniqueOrThrow({ where: { id: child.id } });
  assert.equal(row.totalStars, 8);
  assert.deepEqual([...row.badges].sort(), ['a', 'b']);
});

test('replaying the same snapshot is idempotent', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const body = { profile_id: child.id, total_stars: 6, progress_by_module: numbersProgress(6, 2) };

  const first = await syncProgress(parent.id, body as never);
  const second = await syncProgress(parent.id, body as never);

  assert.deepEqual(second.progress_by_module, first.progress_by_module);
  assert.equal(second.total_stars, first.total_stars);
});

test("syncing another parent's child 404s", async () => {
  const owner = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: owner.id });

  await assert.rejects(
    () => syncProgress(stranger.id, { profile_id: child.id, total_stars: 1 } as never),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
});
```

- [ ] **Step 4: RED** — `pnpm --filter @gabee/web run test:integration` from the repo root. Expected first failure mode: module/env resolution (fix imports/paths), then all five tests must pass with NO production change — the merge already ships. If any assertion fails against the real service, STOP and report: that is a product bug, not a test to adjust.

- [ ] **Step 5: GREEN + regressions** — same command → 5/5. Then `pnpm --filter @gabee/web run test` (unit suite still green, integration file NOT picked up — verify the count didn't change) and `pnpm run test:integration` at the root (db then web, serialized).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/test/setup-integration.ts apps/web/src/lib/server/services/progress.integration.test.ts apps/web/package.json turbo.json
git commit -m "test(web/progress): integration harness + monotonic-merge guarantees against real Postgres"
```

---

### Task 5: Event ingestion integration tests (service level)

**Files:**
- Test: `apps/web/src/lib/server/services/events.integration.test.ts`

**Interfaces:**
- Consumes: Task 4's harness; `ingestEvents` from `apps/web/src/lib/server/services/events.ts`; factories.
- Produces: the `makeEnvelope` helper pattern Task 6 reuses inline.

- [ ] **Step 1: Write the test**

```ts
import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@gabee/types';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import { ingestEvents } from './events';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

function makeEnvelope(profileId: string | null, overrides: Record<string, unknown> = {}): EventEnvelope {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    session_id: randomUUID(),
    client_ts: new Date(2026, 0, 2, 10, 0, 0).toISOString(),
    schema_version: 1,
    event: { name: 'session_start', initiation_label: null },
    ...overrides,
  } as EventEnvelope;
}

test('replayed events are counted as duplicates, stored once (idempotency)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const env = makeEnvelope(child.id);

  const first = await ingestEvents(parent.id, [env]);
  const replay = await ingestEvents(parent.id, [env]);

  assert.equal(first.accepted, 1);
  assert.deepEqual({ accepted: replay.accepted, duplicates: replay.duplicates }, { accepted: 0, duplicates: 1 });
  assert.equal(await prisma.event.count({ where: { eventId: env.event_id } }), 1);
});

test("events for another parent's profile are rejected, others in the batch still land", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const mine = await createChild(prisma, { parentId: parent.id });
  const theirs = await createChild(prisma, { parentId: stranger.id });
  const ok = makeEnvelope(mine.id);
  const stolen = makeEnvelope(theirs.id);

  const res = await ingestEvents(parent.id, [ok, stolen]);

  assert.equal(res.accepted, 1);
  assert.deepEqual(res.rejected, [stolen.event_id]);
  assert.equal(await prisma.event.count(), 1);
});

test('session_start seeds the classification queue; session_end stamps duration', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const sessionId = randomUUID();

  await ingestEvents(parent.id, [
    makeEnvelope(child.id, { session_id: sessionId, event: { name: 'session_start', initiation_label: null, tz: 'Europe/Paris', tz_offset_min: 120 } }),
  ]);
  const seeded = await prisma.sessionClassification.findUniqueOrThrow({ where: { sessionId } });
  assert.equal(seeded.profileId, child.id);
  assert.equal(seeded.tz, 'Europe/Paris');

  await ingestEvents(parent.id, [
    makeEnvelope(child.id, { session_id: sessionId, event: { name: 'session_end', duration_s: 300 } }),
  ]);
  const closed = await prisma.sessionClassification.findUniqueOrThrow({ where: { sessionId } });
  assert.equal(closed.durationS, 300);
});
```

If `session_end`'s payload schema differs (check `packages/types/src/events.ts`), align the event object — assertions stay.

- [ ] **Step 2: Run** — `pnpm --filter @gabee/web run test:integration` → all pass (the two files run serially). Any assertion failure against the real service = product bug: STOP and report.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/server/services/events.integration.test.ts
git commit -m "test(web/events): ingestion idempotency, ownership rejection, classification queue against real Postgres"
```

---

### Task 6: Events route-level test (lenient validation + auth)

**Files:**
- Create: `apps/web/src/test/auth.ts` (session-token helper for tests)
- Test: `apps/web/src/app/api/events/route.integration.test.ts`

**Interfaces:**
- Consumes: `POST` from `apps/web/src/app/api/events/route.ts`; `createSessionToken` from `@/lib/server/auth`; `PARENT_SESSION_COOKIE` (import it from the same module `auth.ts` imports it from — check its import list); `NextRequest` from `next/server`.
- Produces: `authedRequest(url, token, body)` helper — the Layer-3 pattern later phases copy.

- [ ] **Step 1: Helper** — `apps/web/src/test/auth.ts`:

```ts
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/server/auth';
import { PARENT_SESSION_COOKIE } from '@/lib/server/cookies'; // ← adjust to the real module auth.ts imports it from

export async function parentToken(parentId: string, email: string): Promise<string> {
  return (await createSessionToken({ parentId, email })).token;
}

export function authedRequest(url: string, token: string | null, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { cookie: `${PARENT_SESSION_COOKIE}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 2: Write the test** — `apps/web/src/app/api/events/route.integration.test.ts`:

```ts
import '../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import { parentToken, authedRequest } from '../../../../test/auth';
import { POST } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

function validEnvelope(profileId: string) {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    session_id: randomUUID(),
    client_ts: new Date(2026, 0, 2, 11, 0, 0).toISOString(),
    schema_version: 1,
    event: { name: 'session_start', initiation_label: null },
  };
}

test('lenient batch: one malformed event is rejected by id, the valid one lands (200, not 422)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const token = await parentToken(parent.id, parent.email);
  const good = validEnvelope(child.id);
  const badId = randomUUID();
  const bad = { event_id: badId, event: { name: 'not_a_real_event' } }; // fails EventEnvelopeSchema

  const res = await POST(authedRequest('http://localhost/api/events', token, { events: [good, bad] }), { params: Promise.resolve({}) } as never);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.accepted, 1);
  assert.ok(body.rejected.includes(badId));
  assert.equal(await prisma.event.count({ where: { eventId: good.event_id } }), 1);
});

test('unauthenticated ingestion is refused with 401', async () => {
  const res = await POST(authedRequest('http://localhost/api/events', null, { events: [] }), { params: Promise.resolve({}) } as never);
  assert.equal(res.status, 401);
});
```

Adjust the second `POST` argument to the actual handler signature (the `route()` wrapper in `@/lib/server/http` may take only the request) — read the wrapper first.

- [ ] **Step 3: Run** — `pnpm --filter @gabee/web run test:integration`. Two known risks, in order:
  1. `@/` alias resolution under tsx — tsx honors tsconfig `paths`; if resolution still fails, report DONE_WITH_CONCERNS proposing relative-import fallbacks for the test files only (do NOT touch production imports).
  2. `env.ts` validation on import — the dev fallback covers `AUTH_JWT_SECRET` outside production; if another variable hard-fails, add its safe test default to `setup-integration.ts` (never a real secret).
  Expected: all integration files pass serially.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/test/auth.ts apps/web/src/app/api/events/route.integration.test.ts
git commit -m "test(web/events): route-level lenient ingestion + 401 contract with real session JWTs"
```

---

### Task 7: Spec wording fix + full pipeline + PR

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-test-strategy-design.md` (Layer-2 item 1)

- [ ] **Step 1: Update the spec** — in Layer 2, replace the `progress-merge` bullet's "server-side last-write-wins per-field merge (product-spec §8). Property: replaying the same sync batch is idempotent." with:

```markdown
1. `progress-merge` + `progress` — server-side MONOTONIC merge under a
   `FOR UPDATE` row lock (max stars/plays/levels, min best_time, union
   seen-ids/badges): a stale device must never regress progress, concurrent
   device syncs must both land, and replaying a snapshot is idempotent.
   (The kid-side QUEUE is last-write-wins per profile; the server-side merge
   is deliberately stronger than the spec's original LWW wording.)
```

- [ ] **Step 2: Full local pipeline**

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration
```
Expected: everything green (kid suites grew by 3 files, web by 3).

- [ ] **Step 3: Push and PR**

```bash
git add docs/superpowers/specs/2026-07-14-test-strategy-design.md
git commit -m "docs(specs): layer-2 wording — server merge is monotonic under row lock, not LWW"
git push -u origin feature/test-offline-core
gh pr create --base main --title "test(offline-core): phase 2a — SyncManager/Dexie unit + progress-merge/events integration" --body "Implements phase 2a of docs/superpowers/specs/2026-07-14-test-strategy-design.md (offline core, product risk #1).

- kid unit (DOM suite): SyncManager drain semantics (batching ≤500, confirmed-row removal, transient retention, LWW progress queue), scheduling (exponential backoff 2s→60s, single-flight, syncNow, status transitions), Dexie queue contracts
- web integration (*.integration.test.ts convention, serialized, real gabee_test Postgres): monotonic progress merge (no stale-device regression, badge union, row-lock concurrency, idempotent replay, ownership 404), event ingestion (event_id idempotency, ownership rejection, classification queue), route-level lenient batch validation + 401
- spec wording updated: server merge is monotonic under row lock (stronger than the original LWW wording)

Phase 2b (Playwright bootstrap + kid offline e2e) is planned next."
```

- [ ] **Step 4: Watch CI to green** — `gh run list --branch feature/test-offline-core --limit 1`, then `gh run watch <id> --exit-status`. Iterate on failures until green; never fire-and-forget.

---

## Self-Review (done at plan-writing time)

- **Spec coverage (phase 2a):** sync.ts unit ✔ (Tasks 1-2 cover batching/backoff/in-flight/status/queueProgress), db.ts unit ✔ (Task 3), progress-merge integration ✔ (Task 4 — monotonic, concurrency, idempotency), events integration ✔ (Tasks 5-6 — idempotency, batch, rejection, lenient route). e2e offline deliberately deferred to plan 2b (scope split declared in Architecture).
- **Placeholders:** none; every step carries runnable code/commands. Two explicitly-bounded adjustment points (ApiError signature, route-wrapper signature) name the file to check and pin the assertions as the contract.
- **Type consistency:** `SyncManager` export name used consistently; `setup-integration.ts` import paths match each test file's depth (`../../../test/...` from `services/`, `../../../../test/...` from `app/api/events/`); `makeEnvelope`/`authedRequest` signatures match their uses.
- **Known risk register:** node:test mock-timers vs promise interleaving (Task 2 fallback specified), `@/` alias under tsx (Task 6 fallback specified), env validation on import (Task 6 mitigation specified).
