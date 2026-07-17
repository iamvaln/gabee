# Phase 6 — Budgets & Coverage Thresholds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the final CI quality gates from the test-strategy spec — bundle-**size-limit** budgets (hard-fail), **c8 ratcheted coverage thresholds** per package (hard-fail), and **Lighthouse CI** perf budgets (warn-only initially) — so regressions in payload size, test coverage, and page performance are caught automatically.

**Architecture:** Three independent gates. (1) `size-limit` at repo root measures gzipped JS of the built kid `dist/` and web `.next/` chunks against budgets = measured-current +10%. (2) each package's existing `test:coverage` (c8) gains `--check-coverage` with per-metric thresholds ratcheted just below measured. (3) `@lhci/cli` runs in the e2e job against the already-built+served apps, asserting LCP/TBT/perf-score as **warnings** (non-blocking) until variance is observed. size-limit + Lighthouse need built apps, so they run in the `e2e` job (which already builds); coverage runs in the `check` job.

**Tech Stack:** `size-limit` + `@size-limit/file`, `@lhci/cli`, existing `c8` (v11), turbo, the CI workflow `.github/workflows/ci.yml`.

## Global Constraints

- **Budgets/thresholds are derived from MEASUREMENT, never guessed.** size-limit budget = measured gzip +10% (rounded to a clean kB). Coverage threshold = measured % floored to the whole number at or just below current (a ratchet that can only rise later). Record the measured value in a comment next to each budget/threshold.
- **Measured baselines (this branch, `pnpm exec turbo run build`):** kid `dist/assets` gzip — largest chunk `vendor-*.js` ≈ **149 KB**, all-JS total ≈ **219 KB**. Web + coverage numbers are measured in their tasks (do NOT hardcode from here — re-measure on the CI-equivalent build).
- **size-limit + Lighthouse run in the `e2e` job** (after `pnpm run build`), because the `check` job does not build apps. Coverage (`test:coverage`) runs in the `check` job. Do not add a second full app build to `check`.
- **Lighthouse is WARN-ONLY** this phase (spec: "`warn` initially → `error` after variance is observed"). It must NOT fail the job. Use `assertMatrix`/`assertions` at `warn` level and an lhci step that never exits non-zero on assertion (only on hard collect errors).
- **Coverage caveats (measure, don't fight):** kid `test:coverage` covers only pure `*.test.ts` unit files, NOT the `*.test.tsx` DOM suite (`--test-force-exit` kills the c8 flush — documented limitation), so kid coverage is partial and its threshold reflects only the unit-covered modules. `@gabee/types` is ~99%. Web excludes `*.integration.test.*`. Set each threshold from THAT package's real measured number.
- c8 must wrap `node` directly (wrapping `pnpm run test` yields an empty 0% table) — the existing `test:coverage` scripts already do this; extend them, don't rewrite.
- Node 20, pnpm, `--frozen-lockfile` in CI (so any new dep must land in `pnpm-lock.yaml` — run `pnpm install` and commit the lockfile).
- No AI-attribution trailers. Each task lands green locally before the CI wiring is trusted.

---

## File Structure

- Modify: root `package.json` (add `size-limit` + `@size-limit/file` devDeps, a `size` script), `pnpm-lock.yaml` — Task 1
- Create: root `.size-limit.json` (kid + web entries with measured budgets) — Task 1
- Modify: `apps/kid/package.json`, `apps/web/package.json`, `packages/types/package.json` (append `--check-coverage --lines/functions/branches/statements` to `test:coverage`) — Task 2
- Create: `lighthouserc.json` (or `.lighthouserc.cjs`) at repo root — Task 3
- Modify: root `package.json` (add `@lhci/cli` devDep + a `lhci` script), `pnpm-lock.yaml` — Task 3
- Modify: `.github/workflows/ci.yml` — add size-limit + Lighthouse steps to `e2e`; coverage step to `check` — Task 4

---

## Task 1: size-limit budgets (kid + web)

**Files:** root `package.json`, root `.size-limit.json`, `pnpm-lock.yaml`.

- [ ] **Step 1: Add deps + script.** `pnpm add -Dw size-limit @size-limit/file`. Add `"size": "size-limit"` to root `package.json` scripts. Commit the lockfile change.

- [ ] **Step 2: Build + measure.** `pnpm exec turbo run build`. Measure the gzip sizes to set budgets:
  - kid total: `find apps/kid/dist/assets -name '*.js' -exec cat {} + | gzip -c | wc -c`
  - kid largest (vendor): `gzip -c apps/kid/dist/assets/vendor-*.js | wc -c`
  - web shared first-load chunks: `for f in apps/web/.next/static/chunks/*.js; do gzip -c "$f" | wc -c; done` (sum the framework/main/webpack/shared chunks — these load on every route; this is the enforced first-load baseline proxy for the spec's "landing/parent/admin first-load JS", since the shared chunks dominate and their filenames are stable-prefixed).

- [ ] **Step 3: Write `.size-limit.json`** with one entry per budget, `path` globs pointing at the built output, `limit` = measured +10% (clean kB), `gzip: true`. Example shape (fill real limits from Step 2):
```json
[
  { "name": "kid: total JS (gzip)", "path": "apps/kid/dist/assets/*.js", "limit": "240 kB", "gzip": true },
  { "name": "kid: vendor chunk (gzip)", "path": "apps/kid/dist/assets/vendor-*.js", "limit": "165 kB", "gzip": true },
  { "name": "web: shared first-load JS (gzip)", "path": "apps/web/.next/static/chunks/*.js", "limit": "<measured+10%> kB", "gzip": true }
]
```
  Add a comment (in a sibling `.md` or the PR body — JSON has no comments) recording each measured baseline the limit derives from.

- [ ] **Step 4: Verify** `pnpm run size` passes (all under budget) against the current build. Deliberately confirm it FAILS if a budget is set 1 kB below measured (then restore) — proves the gate bites.

- [ ] **Step 5: Commit** — `test(ci): size-limit budgets for kid dist + web first-load JS (measured +10%)`.

---

## Task 2: c8 ratcheted coverage thresholds

**Files:** `apps/kid/package.json`, `apps/web/package.json`, `packages/types/package.json`.

- [ ] **Step 1: Measure current coverage** per package: `pnpm --filter @gabee/types run test:coverage`, `pnpm --filter @gabee/web run test:coverage`, `pnpm --filter @gabee/kid run test:coverage`. Record the `% Lines / % Funcs / % Branches / % Stmts` from each c8 text summary.

- [ ] **Step 2: Append `--check-coverage` with ratcheted thresholds** to each package's `test:coverage` script — thresholds = measured floored to a whole number AT or just below current (headroom of ~1-2 points so unrelated PRs don't trip it, but high enough to catch real drops). c8 flags go right after `c8`:
  `c8 --check-coverage --lines <L> --functions <F> --branches <B> --statements <S> -r text -r lcov -r html ...` (keep the existing `-x` excludes + the `node --import tsx --test $files` tail intact).
  Record the measured value in a trailing comment is impossible in package.json JSON — instead note them in the PR body / this plan's Self-Review.

- [ ] **Step 3: Verify** each `test:coverage` still passes (measured ≥ threshold). Confirm the gate bites: temporarily bump one package's `--lines` above measured → it exits non-zero → restore.

- [ ] **Step 4: Commit** — `test(coverage): c8 --check-coverage ratcheted thresholds per package`.

---

## Task 3: Lighthouse CI (warn-only)

**Files:** root `lighthouserc.json`, root `package.json` (`@lhci/cli` devDep + `lhci` script), `pnpm-lock.yaml`.

- [ ] **Step 1: Add dep + script.** `pnpm add -Dw @lhci/cli`. Add `"lhci": "lhci autorun"` to root scripts. Commit the lockfile.

- [ ] **Step 2: Write `lighthouserc.json`.** Collect 3 runs against the three target URLs (built apps served on :3000 web / :5173 kid — start them the same way the e2e webServer does, or point `url` at already-running servers). Assert LCP / TBT / performance-score as **warn** (never error):
```json
{
  "ci": {
    "collect": {
      "numberOfRuns": 3,
      "url": [
        "http://localhost:5173/",
        "http://localhost:3000/fr",
        "http://localhost:3000/admin/login"
      ],
      "settings": { "preset": "desktop" }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["warn", { "minScore": "<measured-0.05>" }],
        "largest-contentful-paint": ["warn", { "maxNumericValue": "<measured+margin>" }],
        "total-blocking-time": ["warn", { "maxNumericValue": "<measured+margin>" }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```
  (kid hub = `/` on :5173; web landing = `/fr`; parent login target = `/admin/login` OR the parent login route — verify the actual parent login path and use it; the spec says "parent login".) Fill numeric assertion values from a local collect run's median so warnings are meaningful, not noise.

- [ ] **Step 3: Verify locally.** Build apps, start both servers (`pnpm --filter @gabee/web run start` + `pnpm --filter @gabee/kid run preview --port 5173 --strictPort`), run `pnpm run lhci`. Confirm it collects 3 runs per URL and reports assertions as warnings (exit 0 even if a budget is exceeded — warn must not fail).

- [ ] **Step 4: Commit** — `test(ci): Lighthouse CI perf budgets (warn-only) for kid hub, web landing, parent login`.

---

## Task 4: Wire the gates into CI

**Files:** `.github/workflows/ci.yml`.

- [ ] **Step 1: Coverage in `check`.** After the existing "Integration tests" step, add a "Coverage thresholds" step: `run: pnpm run test:coverage`. (Runs each package's `test:coverage`, now with `--check-coverage`; fails the job under threshold. No app build needed — coverage is unit-level.)

- [ ] **Step 2: size-limit in `e2e`.** After "Build apps", add a "Bundle size budgets" step: `run: pnpm run size`. (Reuses the build; hard-fails on breach.)

- [ ] **Step 3: Lighthouse in `e2e`.** After the e2e run (or in parallel after build), add a Lighthouse step that starts both built servers, waits for readiness, runs `pnpm run lhci`, and does NOT fail the job on assertion warnings. Guard with `continue-on-error: true` as a belt-and-suspenders so a flaky collect never reds the required job while LH is warn-only. Upload the LH report as an artifact.

- [ ] **Step 4: Verify the workflow parses** (`grep`/yaml sanity) and the step ordering is correct (build precedes size + lhci). Push and watch CI: `check` (now with coverage gate) and `e2e` (now with size + LH) must both stay green. Never fire-and-forget.

- [ ] **Step 5: Commit** — `ci: enforce size-limit + coverage gates, add Lighthouse (warn) to CI`.

---

## Task 5: Full pipeline + PR

- [ ] **Step 1: Full local pipeline** — `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration && pnpm run size` (and a local `test:coverage` to confirm the gates). Build + local lhci smoke. Any FAILURE = STOP.
- [ ] **Step 2: Push + PR** — `git push -u origin feature/test-budgets-thresholds`, `gh pr create --base main` titled `test(ci): phase 6 — size-limit + coverage thresholds + Lighthouse (warn)`, body recording every measured baseline → budget/threshold (the audit trail for the +10% / ratchet), and noting Lighthouse is warn-only pending variance observation.
- [ ] **Step 3: Watch CI to green** — both `check` and `e2e`. Confirm the new steps ran (coverage gate in check; size + LH in e2e) and that LH warnings did not fail the job. Iterate; never fire-and-forget.

---

## Self-Review (done at plan-writing time)

- **Spec coverage (phase 6 = spec item 6 + "Bundle-size & speed budgets"):** size-limit for kid (dist gzip total + largest chunk) ✓ (Task 1); web first-load JS ✓ (Task 1, enforced via the stable shared-chunk baseline — the honest proxy for per-route first-load without custom Next-manifest tooling; noted as a limitation). Lighthouse CI in the e2e job, kid hub / web landing / parent login, median of 3, LCP/TBT/perf, warn→error ✓ (Task 3, warn this phase). c8 `check-coverage` per package, ratcheted from measured ✓ (Task 2). CI wiring ✓ (Task 4).
- **Measurement-first:** every numeric budget/threshold is set from a measured value in its task, not guessed — the plan carries only the kid baseline already measured, and mandates re-measuring web/coverage/LH in-task. Each gate has a "confirm it bites" step so no gate is vacuous.
- **Known risks:** (1) Lighthouse CI variance — mitigated by warn-only + `continue-on-error` so it can't red the required job this phase; a follow-up flips to `error` once variance is observed. (2) hashed chunk filenames — size-limit globs use stable prefixes (`vendor-*`, `.next/static/chunks/*`). (3) kid DOM coverage gap — the threshold reflects only unit-covered modules by design; documented, not worked around. (4) `--frozen-lockfile` in CI — new devDeps require committing `pnpm-lock.yaml`. (5) web first-load precision — the shared-baseline proxy is enforced; if per-route precision is later wanted, a `.next` manifest reader is the follow-up.
