# Test Strategy — Gabee monorepo (unit → e2e)

**Date:** 2026-07-14
**Status:** Draft — pending user review
**Scope:** apps/web, apps/kid, packages/types, packages/db

## Context

Current state (measured 2026-07-14 with `node --experimental-test-coverage`):

- `packages/types`: ~99 % lines — the only well-covered package (contracts test).
- `apps/kid`: 8 test files for 102 source files. `src/lib` core logic partially
  covered (turtle 51 %, guide 41 %, audio ~80 %); no screen tested except
  `CodeTurtleSession.guide`. `sync.ts` and `db.ts` — the offline/sync core the
  product spec §8 calls out — have **zero** tests.
- `apps/web`: 3 test files for 257 source files (~2-3 % of files). None of the
  80 API routes or ~40 server services beyond `ua`/`request-meta`/`hourly-usage`
  are tested. No DOM test setup exists on the web side.
- `packages/db`: no tests (Prisma schema + seed).
- CI (`ci.yml`): lint + typecheck + unit tests on every PR/push to main. **No
  Postgres service** — no DB-backed testing exists anywhere.
- All tests run on Node's built-in runner (`node --import tsx --test`);
  kid DOM tests use `global-jsdom` + `fake-indexeddb` via `src/test/setup-dom.ts`.
- Trap: kid `test`/`test:dom` scripts list test files **by name** — a new test
  file that isn't added to package.json never runs. Web's find only matches
  `*.test.ts` (would silently skip `.tsx`).

## Goals & success criteria

Decided with the user:

1. **All three fronts in parallel** — kid app, web API/data, parent/admin UI.
2. **Risk-first, thresholds later** — cover critical flows first; only once
   numbers are up, enforce per-package coverage thresholds in CI. Initial
   thresholds are set from *measured* values (ratchet), not aspirational ones.
3. **Full e2e on 3 surfaces** — kid PWA (incl. offline/sync), parent, admin —
   against a real seeded Postgres. Target: the phase1-engineering-checklist §8
   "Definition of done" flows are all executable as Playwright tests.
4. **Bundle-size and runtime-speed budgets** are part of the test surface.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Unit runner | Keep `node:test` + tsx | Already works (12 files); zero migration; Vitest's rolldown native binding is known-broken on this machine. Revisit Vitest only if DX hurts. |
| Coverage | `c8` (V8 coverage + mature source-map remap) | Node 20 lacks native threshold flags (Node 22+); the built-in experimental reporter's line mapping is crude. `c8 check-coverage` gives CI gates. |
| Integration DB | Real Postgres, no Prisma mocks | LWW merge, event idempotency and auth flows are exactly the code mocks lie about. Local: `gabee_test` DB on existing brew Postgres 14. CI: `services: postgres` block. |
| API-route tests | Call `route.ts` handlers directly as functions (`POST(new Request(...))`) | No HTTP server needed; full contract coverage (status codes, cookies, CORS) at integration speed. |
| E2E | Playwright, repo-root `e2e/` workspace, 3 projects (kid / parent / admin) | Offline simulation via `context.setOffline()`; traces/videos on failure. |
| E2E email flows | Read confirmation/reset tokens directly from test Postgres | No email-interception infra; Mailgun never called in test env. |
| Bundle size | `size-limit` budgets per app, enforced in CI | Deterministic → strict gate. Budgets = current size +10 %; raising one is an explicit PR diff. |
| Runtime speed | Lighthouse CI on built apps, median of 3 runs | CI timing is noisy → assertions start as `warn`, flip to `error` once variance is known. |
| Git hooks | lefthook, **pre-push** (not pre-commit) | lint + typecheck + unit only (< 30 s target); integration/e2e stay in CI. |

## Layer 1 — Unit (node:test + tsx)

Fast, no I/O. Priority targets by risk:

**apps/kid** (`src/lib`):
- `sync.ts` — batching (MAX_BATCH 500), exponential backoff (2 s→60 s),
  in-flight guard, 30 s periodic flush, online/offline transitions, status
  emission. Use `node:test` `mock.timers` + a mocked API module.
- `db.ts` — Dexie queues on `fake-indexeddb`: enqueue, drain, per-profile
  progress `put`-replace semantics.
- `router.ts` — Route↔URL codec round-trip (encode→parse = identity for every
  route variant), guard/deep-link edge cases.
- `progression.ts`, `selectSession.ts`, `sessionResume.ts`, `nextLesson.ts` —
  the session-runtime rules from gabee-session-runtime-v0.1 (level-first
  ordering, already-seen dedup).
- `streak.ts`, `badges.ts`, `milestones.ts`, `healthy-use.ts`, `events.ts`.
- Raise `turtle.ts` (51 %) and `guide.ts` (41 %) — uncovered branches.

**apps/web**: pure service logic (mappers, validation, calculations) that
doesn't need the DB. jsdom setup mirrored from kid **only when** a web
component test is first needed (not speculatively).

**packages/types**: already ~99 % — maintain (new contracts get tests in the
same PR).

## Layer 2 — DB integration (new)

Web services against real Postgres. Priority order:

1. `progress-merge` + `progress` — server-side MONOTONIC merge under a
   `FOR UPDATE` row lock (max stars/plays/levels, min best_time, union
   seen-ids/badges): a stale device must never regress progress, concurrent
   device syncs must both land, and replaying a snapshot is idempotent.
   (The kid-side QUEUE is last-write-wins per profile; the server-side merge
   is deliberately stronger than the spec's original LWW wording.)
2. `events` — envelope `event_id` idempotency, 500-event batches, rejected
   events dropped-with-log.
3. `auth` + `accounts` + `email-confirmation` + `password-reset` — signup,
   scrypt hashing, JWT issuance, token lifecycle.
4. `devices` / pairing (`pair`, `claim-code` flows), `bundles`, `profiles`,
   `healthy-use`, `family`, `gifts`, `messages`.

Isolation: truncate affected tables between suites (helper), not per-test
transactions (Prisma interactive tx doesn't wrap test bodies cleanly).
Migrations applied once per run via `prisma migrate deploy`.

## Layer 3 — API-route integration (new)

Handlers invoked as functions against the test DB. Covers: HTTP contracts,
error codes, parent/admin cookie auth boundaries, and rate-limit behavior.
The middleware (`src/proxy.ts` — locale routing, CSP/security headers, CORS)
is not invokable as a plain function; its observable effects are asserted in
e2e instead (response headers checked on real pages).

Rollout order: kid/device-facing routes first (`events`, `progress/sync`,
`pair`, `bundles`, `profiles/*`), then `auth/*`, then `admin/*`.

## Layer 4 — E2E (Playwright, new `e2e/` workspace)

Runs against **built** apps (`vite preview` for kid, `next start` for web) +
migrated & seeded test Postgres, via Playwright `webServer`.

- **kid**: pair by code → profile select → one session per module (numbers,
  words, keyboard, code, translation) → stars/progression persist. **Offline
  scenario**: go offline (`context.setOffline(true)`) → play a full session →
  reconnect → assert every event row lands in Postgres (phase1 DoD).
- **parent**: signup → email confirmation (token read from DB) → dashboard →
  classify a session → settings (password change).
- **admin**: login → content plan/pool/publish → users → healthy-use limits.

Artifacts on failure: trace + video, uploaded from CI.

## Bundle-size & speed budgets

- **size-limit** at repo root, config per app:
  - kid: gzipped JS of Vite `dist/` (total + largest chunk) — this is what the
    SW precaches and a child first downloads.
  - web: first-load JS of key Next routes (landing, parent dashboard, admin).
  - Initial budgets = measured current size +10 %. CI fails on breach.
- **Lighthouse CI** in the e2e job (apps already built/served): kid hub, web
  landing, parent login. Median of 3 runs; budgets on LCP, TBT, performance
  score. `warn` initially → `error` after variance is observed.

## When tests run (cadence)

1. **While developing**: `node --test --watch` on the touched package.
2. **pre-push** (lefthook): lint + typecheck + all unit tests. Target < 30 s.
   No DB/e2e in hooks.
3. **Every PR + push to main** (CI): job `check` = lint, typecheck, unit,
   DB/API integration (Postgres service), size-limit. Parallel job `e2e` =
   Playwright 3 projects + Lighthouse. Both required.
4. **Later (optional)**: nightly cron for extended e2e matrix + Lighthouse
   trend; post-deploy smoke against the VPS after release tags.

## Test infrastructure changes

- **Glob discovery everywhere** (kills the listed-by-name trap). Convention in
  kid: `*.test.ts` = pure logic (`test`), `*.test.tsx` = DOM (`test:dom`,
  matches all existing files). Web find fixed to include `.tsx`.
- `test:coverage` script per package (c8, lcov + text reporters).
- **Shared test helpers**: `packages/db` testing entry — test Prisma client
  (`TEST_DATABASE_URL`), `resetDb()` truncation helper, data factories
  (parent, child, device, question, curriculum) reused by layers 2-4.
- CI `check` job gains a `postgres:14` service + `migrate deploy` step.
- New CI `e2e` job (parallel): build apps → Playwright → Lighthouse →
  artifacts.

## Sequencing (risk-first)

1. **Foundations**: glob discovery, c8 scripts, `gabee_test` DB + factories +
   `resetDb`, Postgres service in CI, lefthook.
2. **Offline core** (product risk #1): unit `sync.ts`/`db.ts` + integration
   `progress-merge`/`events` + kid offline e2e.
3. **Auth & pairing**: integration + e2e (parent signup, device pairing,
   admin login).
4. **Sessions & progression**: unit progression/selectSession/sessionResume +
   one-session-per-module e2e.
5. **Parent/admin surfaces**: remaining API integration + management-flow e2e.
6. **Budgets & thresholds**: size-limit + Lighthouse budgets; then
   `c8 check-coverage` per package with ratcheted thresholds from measured
   values.

Each phase lands as its own PR(s); CI stays green throughout.

## Out of scope (deliberate)

- Testing the Workbox service worker in isolation (offline behavior is
  verified end-to-end in Playwright instead).
- Visual-regression/screenshot testing.
- Load/stress testing — deferred, not dismissed. The project is built in
  public and a viral reshare could spike traffic with no warning. Trigger to
  revisit: before opening beyond the pilot, or at the first sign of organic
  traction. First targets then: k6 scripts against `/api/events`,
  `/api/progress/sync` (mass SyncManager replay after reconnection) and
  `/api/bundles` on a prod-like VPS.
- Unit tests inside `packages/db` — for its *current* content only: schema,
  generated client, migrations and seed are all exercised for real by layers
  2-4 (migrate deploy + seed run on every integration/e2e setup; seed rows
  validated by the ~99 %-covered `@gabee/types` schemas). If the package
  gains hand-written logic (query helpers, the `testing.ts` factories, seed
  computation), that logic gets unit tests like any other.
- Vitest migration (revisit only if node:test DX becomes a bottleneck).
