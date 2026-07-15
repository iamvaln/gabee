# Security Framework — Dynamic + AI Layer (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the security review framework's runtime layer — per-finding waiver wiring, a fetch-based dynamic probe suite against an ephemeral throwaway app, a local AI threat-review, and the first full sweep — on top of the merged static core (Plan 1).

**Architecture:** Plan 1 shipped the static deterministic gate (`ops/security/scan.sh`, `pnpm security:scan`, CI backstop) but blocks at *per-tool* granularity and its waiver helper (`waivers.mjs`) is unit-tested yet unwired. Plan 2 (a) normalizes each tool's JSON output into per-finding fingerprints and wires `applyWaivers` into the gate; (b) adds a `fetch`-based DAST-lite probe suite (auth rate-limit, signup abuse, IDOR, authz boundaries) that runs against a throwaway instance spun up with `EMAIL_PROVIDER=noop` + a fresh DB + the existing `seed-fixtures.ts` tester-A/B data; (c) adds a local, advisory `claude -p` threat-review over the release diff; (d) runs the first `--full` sweep and triages the real gaps it surfaces.

**Tech Stack:** bash (bash-3.2-safe — macOS default), Node ≥20.19 ESM (`node --test` for the pure normalizers), **Playwright Test (`@playwright/test`)** for the dynamic probes — using its `request`/APIRequestContext fixture for the current HTTP-level assertions, with the browser `page` fixture available for future DOM/XSS probes, Docker (throwaway Postgres + the built `gabee-web` image), the deterministic scanners (gitleaks/semgrep/osv-scanner/trivy), `claude` CLI headless (`-p --output-format json`), Prisma 7 / Postgres, `yaml` (already a root devDep).

## Global Constraints

- **Node:** keg-only `node@20` at `/opt/homebrew/opt/node@20/bin` (20.20.2). Every `node`/`pnpm` command in this plan assumes `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`.
- **Bash 3.2-safe:** the dev machine's `/usr/bin/env bash` is 3.2.57. No `${arr[@]}` on a possibly-empty array under `set -u` without the `${arr[@]+"${arr[@]}"}` guard; no associative arrays; no `mapfile`.
- **No `Co-Authored-By` trailer** on any commit or PR body.
- **Dynamic-probe safety (non-negotiable):** probes NEVER run against prod and NEVER against a real email/payment provider. The target MUST have `EMAIL_PROVIDER=noop` (or no mail creds) and a DB whose name ends in `_test`. A probe run that cannot confirm a `noop`/throwaway target MUST refuse to run (fail closed).
- **Fingerprint stability:** a finding's fingerprint must be deterministic across runs (no timestamps, no absolute paths, no line-drift-sensitive content beyond `file:rule:line`) so a waiver keyed on it stays valid until the code actually changes.
- **AI review is advisory + local-only:** it never sets the block tier, never runs in CI, and a missing `claude` CLI is a graceful skip (logged), not a failure.
- **Reuse Plan 1, don't fork it:** `applyWaivers`/`isAccountableWaiver` (`ops/security/waivers.mjs`), `resolveChecks`/`validRef` (`ops/security/scope.mjs`), `routes.yml`, and the tiered-exit contract in `scan.sh` already exist and are tested — extend them, do not reimplement.
- **Exit-code contract (from Plan 1, preserved):** `0` PASS · `1` BLOCK · `2` usage · `3` missing tool under `--strict` · `4` scope/resolver failure. Plan 2 adds `5` = dynamic-probe block-tier failure (a failing authz/IDOR/rate-limit probe), so a report can distinguish a static block from a dynamic one.

---

## File Structure

- `ops/security/findings.mjs` — **new.** Pure normalizers: each tool's JSON → canonical `Finding[]`. No I/O, no tool execution. Fully unit-testable from fixtures.
- `ops/security/findings.test.mjs` — **new.** Unit tests for every normalizer + the block-tier classifier, from committed sample-JSON fixtures.
- `ops/security/fixtures/` — **new.** Committed sample tool-output JSON (`gitleaks.json`, `semgrep.json`, `osv.json`, `trivy.json`) for the normalizer tests.
- `ops/security/scan.sh` — **modify.** Static tools emit JSON → `findings.mjs` normalizes → `applyWaivers` filters → block on non-waived block-tier. Add the dynamic-probe stage + the AI stage. New exit code `5`.
- `ops/security/dynamic/target.sh` — **new.** Bring up / tear down the ephemeral throwaway target (Docker Postgres + migrate + seed + `gabee-web` on a published port, `EMAIL_PROVIDER=noop`); prints `BASE_URL`.
- `ops/security/dynamic/playwright.config.ts` — **new.** Playwright Test config: `testDir: probes/`, `use.baseURL = process.env.SEC_BASE_URL`, a chromium project (browser binaries only needed once DOM probes are added), line + JSON reporter.
- `ops/security/dynamic/probe-lib.ts` — **new.** Shared probe helpers: `login(request, email, password)`, `TESTERS` (the seed-fixtures A/B constants). Typed against Playwright's `APIRequestContext`.
- `ops/security/dynamic/probes/rate-limit.spec.ts` — **new.** Auth brute-force + signup-abuse probes (Playwright `request` fixture).
- `ops/security/dynamic/probes/idor.spec.ts` — **new.** Object-authz (tester A → tester B's kid/message) probes.
- `ops/security/dynamic/probes/authz.spec.ts` — **new.** Parent-token-on-admin + unauth-on-gated boundary probes.
- `ops/security/dynamic/run.mjs` — **new.** Selects which probe specs to run from the in-scope surfaces (or all under `--full`), brings the target up, runs `playwright test` against `BASE_URL`, tears down, exits `5` on any probe failure.
- `ops/security/ai-review.mjs` — **new.** Builds a prompt from `git diff <ref>..HEAD` + `threat-model.md`, invokes `claude -p --output-format json`, parses advisory findings. Graceful skip if `claude` absent.
- `docs/security/review-process.md` — **modify.** Document the dynamic + AI stages, the throwaway-target lifecycle, and the safe-subset staging option.
- `docs/security/first-sweep-2026-07.md` — **new.** The triaged output of the first `--full` sweep (findings, severities, disposition: fix / waive / backlog).

---

## Task 0: Install the scanners locally + confirm they run

The static gate was never executed with real tools (Plan 1 caveat). Every later task that touches `scan.sh` needs them present, and Task 8 (full sweep) needs them for real.

**Files:** none (environment setup).

- [ ] **Step 1: Install the four scanners**

```bash
brew install gitleaks trivy osv-scanner
pipx install semgrep      # pipx isolates the env (PEP 668); or: pip install --user semgrep
```

- [ ] **Step 2: Confirm each runs and record versions**

Run:
```bash
gitleaks version; trivy --version; osv-scanner --version; semgrep --version
```
Expected: four version strings, no "command not found". If `pipx` isn't present: `brew install pipx && pipx ensurepath`.

- [ ] **Step 3: Sanity-run the existing gate with real tools**

Run (from repo root, node@20 on PATH):
```bash
pnpm security:scan --full 2>&1 | tail -30
```
Expected: it actually executes each tool now (no "MISSING tools" line), writes `.security/report.md`, and exits `0` or `1`. **Do not fix findings yet** — Task 8 triages them. Note whether the Semgrep `prisma-raw-string-interpolation` ERROR rule misfires (the Plan 1 open risk); if it does, record the offending file:line for Task 1's fixtures and Task 8's triage. No commit (environment-only task).

---

## Task 1: Canonical finding normalizers (`findings.mjs`)

Turn each tool's JSON into one stable shape so waivers can key on a per-finding fingerprint.

**Files:**
- Create: `ops/security/findings.mjs`
- Create: `ops/security/findings.test.mjs`
- Create: `ops/security/fixtures/{gitleaks,semgrep,osv,trivy}.json`

**Interfaces:**
- Produces:
  - `normalizeGitleaks(json) -> Finding[]`, `normalizeSemgrep(json) -> Finding[]`, `normalizeOsv(json) -> Finding[]`, `normalizeTrivy(json) -> Finding[]`
  - `isBlockTier(finding) -> boolean`
  - `Finding = { tool: string, fingerprint: string, severity: 'BLOCK'|'ADVISORY', title: string, file: string|null, line: number|null }`
  - Fingerprint format (stable, per tool): `gitleaks:<file>:<rule>:<line>` · `semgrep:<check_id>:<file>:<line>` · `osv:<package>:<vuln_id>` · `trivy:<target>:<check_id>`
- Consumes: nothing (pure).

- [ ] **Step 1: Write committed fixtures**

Create minimal-but-real sample outputs. `ops/security/fixtures/gitleaks.json` (gitleaks `--report-format json` is a top-level array):
```json
[
  { "RuleID": "generic-api-key", "File": "apps/web/src/x.ts", "StartLine": 42, "Secret": "REDACTED", "Fingerprint": "abc:apps/web/src/x.ts:generic-api-key:42" }
]
```
`ops/security/fixtures/semgrep.json` (`--json` → `{results:[...]}`):
```json
{ "results": [
  { "check_id": "gabee.prisma-raw-string-interpolation", "path": "apps/web/src/db.ts", "start": { "line": 10 }, "extra": { "severity": "ERROR", "message": "raw SQL interpolation" } },
  { "check_id": "gabee.api-route-without-zod-parse", "path": "apps/web/src/app/api/x/route.ts", "start": { "line": 3 }, "extra": { "severity": "WARNING", "message": "no zod parse" } }
] }
```
`ops/security/fixtures/osv.json` (`--format json` → `{results:[{packages:[{package,vulnerabilities}]}]}`):
```json
{ "results": [ { "packages": [
  { "package": { "name": "leftpad" }, "vulnerabilities": [ { "id": "GHSA-xxxx", "database_specific": { "severity": "HIGH" } } ] }
] } ] }
```
`ops/security/fixtures/trivy.json` (`--format json` → `{Results:[{Target,Misconfigurations:[...]}]}`):
```json
{ "Results": [ { "Target": "docker-compose.yml", "Misconfigurations": [
  { "ID": "DS002", "Severity": "HIGH", "Title": "root user" }
] } ] }
```

- [ ] **Step 2: Write the failing test**

`ops/security/findings.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeGitleaks, normalizeSemgrep, normalizeOsv, normalizeTrivy, isBlockTier } from './findings.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (n) => JSON.parse(readFileSync(join(dir, 'fixtures', n), 'utf8'));

test('gitleaks → one BLOCK finding with stable fingerprint', () => {
  const f = normalizeGitleaks(fx('gitleaks.json'));
  assert.equal(f.length, 1);
  assert.equal(f[0].fingerprint, 'gitleaks:apps/web/src/x.ts:generic-api-key:42');
  assert.equal(f[0].severity, 'BLOCK');
  assert.ok(isBlockTier(f[0]));
});

test('semgrep → ERROR is BLOCK, WARNING is ADVISORY', () => {
  const f = normalizeSemgrep(fx('semgrep.json'));
  const byId = Object.fromEntries(f.map((x) => [x.fingerprint, x]));
  assert.equal(byId['semgrep:gabee.prisma-raw-string-interpolation:apps/web/src/db.ts:10'].severity, 'BLOCK');
  assert.equal(byId['semgrep:gabee.api-route-without-zod-parse:apps/web/src/app/api/x/route.ts:3'].severity, 'ADVISORY');
});

test('osv → High CVE is BLOCK, fingerprint by package+id', () => {
  const f = normalizeOsv(fx('osv.json'));
  assert.equal(f[0].fingerprint, 'osv:leftpad:GHSA-xxxx');
  assert.equal(f[0].severity, 'BLOCK');
});

test('trivy → HIGH misconfig is BLOCK, fingerprint by target+id', () => {
  const f = normalizeTrivy(fx('trivy.json'));
  assert.equal(f[0].fingerprint, 'trivy:docker-compose.yml:DS002');
  assert.equal(f[0].severity, 'BLOCK');
});

test('empty / missing sections → []', () => {
  assert.deepEqual(normalizeSemgrep({}), []);
  assert.deepEqual(normalizeOsv({ results: [] }), []);
  assert.deepEqual(normalizeTrivy({ Results: [{ Target: 't' }] }), []);
  assert.deepEqual(normalizeGitleaks([]), []);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test ops/security/findings.test.mjs`
Expected: FAIL — `Cannot find module './findings.mjs'` / export errors.

- [ ] **Step 4: Implement `findings.mjs`**

```js
// Normalize each scanner's JSON into a stable per-finding shape so waivers
// (ops/security/waivers.mjs) can key on `fingerprint`. Fingerprints avoid
// timestamps/absolute paths so a waiver survives until the code itself changes.

const norm = (p) => (p == null ? null : String(p).replace(/\\/g, '/'));

// gitleaks detect --report-format json → top-level array of hits.
export function normalizeGitleaks(json) {
  const arr = Array.isArray(json) ? json : [];
  return arr.map((h) => {
    const file = norm(h.File);
    const rule = h.RuleID ?? 'secret';
    const line = h.StartLine ?? null;
    return { tool: 'gitleaks', fingerprint: `gitleaks:${file}:${rule}:${line}`,
      severity: 'BLOCK', title: `secret: ${rule}`, file, line };
  });
}

// semgrep --json → { results: [{ check_id, path, start.line, extra.severity }] }.
// ERROR blocks; WARNING/INFO are advisory (matches scan.sh's --severity ERROR tier).
export function normalizeSemgrep(json) {
  const results = json?.results ?? [];
  return results.map((r) => {
    const file = norm(r.path);
    const line = r.start?.line ?? null;
    const sev = String(r.extra?.severity ?? '').toUpperCase();
    return { tool: 'semgrep', fingerprint: `semgrep:${r.check_id}:${file}:${line}`,
      severity: sev === 'ERROR' ? 'BLOCK' : 'ADVISORY',
      title: r.extra?.message ?? r.check_id, file, line };
  });
}

// osv-scanner --format json → { results:[{ packages:[{ package.name, vulnerabilities:[{id, database_specific.severity}] }] }] }.
// Block on High/Critical; lower or unscored → advisory.
export function normalizeOsv(json) {
  const out = [];
  for (const res of json?.results ?? [])
    for (const pkg of res.packages ?? []) {
      const name = pkg.package?.name ?? 'unknown';
      for (const v of pkg.vulnerabilities ?? []) {
        const sev = String(v.database_specific?.severity ?? '').toUpperCase();
        out.push({ tool: 'osv', fingerprint: `osv:${name}:${v.id}`,
          severity: sev === 'HIGH' || sev === 'CRITICAL' ? 'BLOCK' : 'ADVISORY',
          title: `${name} ${v.id} (${sev || 'unscored'})`, file: 'pnpm-lock.yaml', line: null });
      }
    }
  return out;
}

// trivy config --format json → { Results:[{ Target, Misconfigurations:[{ID, Severity, Title}] }] }.
export function normalizeTrivy(json) {
  const out = [];
  for (const res of json?.Results ?? []) {
    const target = norm(res.Target);
    for (const m of res.Misconfigurations ?? []) {
      const sev = String(m.Severity ?? '').toUpperCase();
      out.push({ tool: 'trivy', fingerprint: `trivy:${target}:${m.ID}`,
        severity: sev === 'HIGH' || sev === 'CRITICAL' ? 'BLOCK' : 'ADVISORY',
        title: m.Title ?? m.ID, file: target, line: null });
    }
  }
  return out;
}

export function isBlockTier(f) { return f?.severity === 'BLOCK'; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test ops/security/findings.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add ops/security/findings.mjs ops/security/findings.test.mjs ops/security/fixtures/
git commit -m "feat(security): per-finding normalizers for gitleaks/semgrep/osv/trivy JSON"
```

---

## Task 2: Wire per-finding waivers into the static gate (`scan.sh`)

Switch the static tools from grep pass/fail to JSON → normalize → `applyWaivers` → block on non-waived block-tier. This is the wiring Plan 1 deferred.

**Files:**
- Modify: `ops/security/scan.sh` (the gitleaks/osv/semgrep/trivy blocks + the final verdict)

**Interfaces:**
- Consumes: `normalizeGitleaks/Semgrep/Osv/Trivy`, `isBlockTier` (Task 1); `applyWaivers` (`waivers.mjs`); waiver list parsed from `security-waivers.yml`.
- Produces: unchanged CLI contract; `.security/report.md` now lists per-finding fingerprints + a `waived:` section; exit `1` only if a non-waived block-tier finding exists.

- [ ] **Step 1: Add a JSON-aggregation helper node script call**

Add a small inline helper invoked from `scan.sh` that reads the four tools' JSON report files (whichever exist), normalizes, applies waivers, and prints a verdict + per-finding lines. Create `ops/security/aggregate.mjs`:
```js
// Read whichever tool JSON reports exist under .security/raw/, normalize, apply
// security-waivers.yml, print a human report to stdout, exit 1 iff a non-waived
// block-tier finding remains. Used by scan.sh after the tools run.
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { normalizeGitleaks, normalizeSemgrep, normalizeOsv, normalizeTrivy, isBlockTier } from './findings.mjs';
import { applyWaivers } from './waivers.mjs';

const raw = '.security/raw';
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const findings = [
  ...(readJson(`${raw}/gitleaks.json`) ? normalizeGitleaks(readJson(`${raw}/gitleaks.json`)) : []),
  ...(readJson(`${raw}/semgrep.json`) ? normalizeSemgrep(readJson(`${raw}/semgrep.json`)) : []),
  ...(readJson(`${raw}/osv.json`) ? normalizeOsv(readJson(`${raw}/osv.json`)) : []),
  ...(readJson(`${raw}/trivy.json`) ? normalizeTrivy(readJson(`${raw}/trivy.json`)) : []),
];
const waiversDoc = existsSync('security-waivers.yml') ? parse(readFileSync('security-waivers.yml', 'utf8')) : {};
const blockers = findings.filter(isBlockTier);
const { blocked, waived } = applyWaivers(blockers, waiversDoc?.waivers ?? []);
const advisory = findings.filter((f) => !isBlockTier(f));

for (const f of blocked) console.log(`- BLOCK  ${f.fingerprint} — ${f.title}`);
for (const f of waived) console.log(`- waived ${f.fingerprint} (by ${f.waiver.approver}, expires ${f.waiver.expires})`);
for (const f of advisory) console.log(`- note   ${f.fingerprint} — ${f.title}`);
console.log(`\nSTATIC: ${blocked.length} blocking, ${waived.length} waived, ${advisory.length} advisory`);
process.exit(blocked.length > 0 ? 1 : 0);
```

- [ ] **Step 2: Run each tool with JSON output into `.security/raw/`**

In `scan.sh`, replace each tool's `A && note clean || {note FINDINGS; BLOCK=1}` block with a JSON-emitting invocation (still gated by `runs`/`have`). Example for gitleaks (apply the analogous change to osv/semgrep/trivy, each writing `.security/raw/<tool>.json`):
```bash
mkdir -p .security/raw
# gitleaks (always) — JSON report; exit code ignored here, findings.mjs decides tier
if runs gitleaks && have gitleaks; then
  gitleaks detect --no-banner --redact -c .gitleaks.toml \
    "${GITLEAKS_SCOPE[@]+"${GITLEAKS_SCOPE[@]}"}" \
    --report-format json --report-path .security/raw/gitleaks.json >/dev/null 2>&1 || true
elif runs gitleaks; then MISSING="$MISSING gitleaks"; fi
```
Semgrep: add `--json --output .security/raw/semgrep.json` (keep `--severity ERROR` for the exit tier is no longer needed — the normalizer classifies; run without `--error` and `|| true`, let JSON drive). osv: `--format json --output .security/raw/osv.json`. trivy: `--format json --output .security/raw/trivy.json`. Guard each with `|| true` (the tool's own exit is advisory now; `aggregate.mjs` is the arbiter).

- [ ] **Step 3: Replace the final verdict with the aggregator**

Replace the `if [ "$BLOCK" -eq 1 ]` verdict block's static portion with:
```bash
# Static verdict comes from the per-finding aggregator (waiver-aware).
if node ops/security/aggregate.mjs | tee -a "$REPORT"; then STATIC_BLOCK=0; else STATIC_BLOCK=1; fi
```
Keep the missing-tools-under-`--strict` (exit 3) and resolver-failure (exit 4) logic. Final: if `STATIC_BLOCK=1` → `note "RESULT: BLOCK"; exit 1`.

- [ ] **Step 4: Test the waiver round-trip with a real planted secret**

Run:
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
printf 'const k = "AKIA1234567890ABCD00";\n' > /tmp/leak.ts && cp /tmp/leak.ts apps/web/src/__leak.ts
pnpm security:scan --full; echo "exit=$?"   # expect BLOCK, exit 1, gitleaks fingerprint listed
```
Copy the printed `gitleaks:apps/web/src/__leak.ts:...` fingerprint into `security-waivers.yml`:
```yaml
waivers:
  - fingerprint: "gitleaks:apps/web/src/__leak.ts:generic-api-key:1"
    reason: "plan-2 waiver round-trip test"
    approver: "valentine"
    expires: "2027-01-01"
```
Run again: `pnpm security:scan --full; echo "exit=$?"` → expect PASS, exit 0, the finding under `waived`. Then set `expires: "2020-01-01"` → expect BLOCK again (expired re-blocks). Finally `rm apps/web/src/__leak.ts` and revert the test waiver.
Expected: block → waive → PASS → expire → block.

- [ ] **Step 5: Commit**

```bash
git add ops/security/scan.sh ops/security/aggregate.mjs
git commit -m "feat(security): finding-level waiver gate — tools emit JSON, aggregate.mjs arbitrates"
```

---

## Task 3: Ephemeral throwaway target (`dynamic/target.sh`)

Bring up a fully isolated app instance for probes: throwaway Postgres, migrations, curriculum + tester-A/B fixtures, `gabee-web` on a published port with `EMAIL_PROVIDER=noop`. Tear it all down after.

**Files:**
- Create: `ops/security/dynamic/target.sh`

**Interfaces:**
- Produces: `target.sh up` prints `BASE_URL=http://127.0.0.1:<port>` on stdout and blocks until `/api/health` is 200; `target.sh down` removes the container + network. Safety: refuses unless the DB name ends in `_test` and `EMAIL_PROVIDER=noop`.

- [ ] **Step 1: Write the bring-up/teardown script**

```bash
#!/usr/bin/env bash
# Ephemeral, isolated DAST target: throwaway Postgres + gabee-web (noop email +
# fresh DB + tester A/B fixtures). NEVER prod, NEVER real mail — enforced below.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)" || exit 2
PORT="${SEC_TARGET_PORT:-3999}"
DB_NAME="gabee_sec_test"            # MUST end in _test (resetDb + our guard)
PG_CT="gabee-sec-pg"; WEB_CT="gabee-sec-web"; NET="gabee-sec-net"
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

case "${1:-}" in
  up)
    [ "${DB_NAME##*_}" = "test" ] || { echo "refusing: DB name must end in _test" >&2; exit 2; }
    docker network create "$NET" >/dev/null 2>&1 || true
    docker run -d --name "$PG_CT" --network "$NET" -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB="$DB_NAME" postgres:16-alpine >/dev/null
    # wait for pg
    for i in $(seq 1 30); do docker exec "$PG_CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
    DB_URL="postgresql://postgres:postgres@${PG_CT}:5432/${DB_NAME}"
    HOST_DB_URL="postgresql://postgres:postgres@127.0.0.1:5433/${DB_NAME}"
    docker run -d --name "$PG_CT-pub" --network host >/dev/null 2>&1 || true  # (no-op placeholder; host mapping below)
    # migrate + seed from the host toolchain against a host-published port
    docker exec "$PG_CT" sh -c "true"  # ensure up
    # publish pg to host for migrate/seed
    # (simpler: run migrate/seed inside a one-shot node container on $NET)
    docker run --rm --network "$NET" -e DIRECT_URL="$DB_URL" -e DATABASE_URL="$DB_URL" \
      -v "$ROOT":/app -w /app node:20-alpine sh -c \
      "corepack enable && pnpm --filter @gabee/db exec prisma migrate deploy && pnpm --filter @gabee/db run db:seed && STAGING_FIXTURES=1 pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts" >/dev/null
    # boot web (reuse the built prod image; build if absent)
    docker image inspect ghcr.io/iamvaln/gabee-web:latest >/dev/null 2>&1 || \
      docker build -f apps/web/Dockerfile -t ghcr.io/iamvaln/gabee-web:latest "$ROOT" >/dev/null
    docker run -d --name "$WEB_CT" --network "$NET" -p "127.0.0.1:${PORT}:3000" \
      -e DATABASE_URL="$DB_URL" -e DIRECT_URL="$DB_URL" -e EMAIL_PROVIDER=noop \
      -e AUTH_JWT_SECRET=throwaway-sec-secret-not-a-real-key \
      -e NODE_ENV=production ghcr.io/iamvaln/gabee-web:latest >/dev/null
    for i in $(seq 1 60); do
      curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && { echo "BASE_URL=http://127.0.0.1:${PORT}"; exit 0; }
      sleep 1
    done
    echo "target failed to become healthy" >&2; exit 1;;
  down)
    docker rm -f "$WEB_CT" "$PG_CT" "$PG_CT-pub" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true;;
  *) echo "usage: target.sh up|down" >&2; exit 2;;
esac
```
> Implementer note: the migrate/seed one-shot above mounts the repo into a `node:20-alpine` container on the same docker network so it can reach `$PG_CT` by name — this avoids publishing Postgres to the host. If `corepack`/`tsx` in-container proves flaky, the fallback is to publish Postgres (`-p 127.0.0.1:5433:5432`) and run migrate/seed from the host toolchain against `HOST_DB_URL`; pick whichever the first run proves reliable and delete the other path. Keep the safety guard (`_test` suffix + `EMAIL_PROVIDER=noop`) whichever way.

- [ ] **Step 2: Test bring-up → health → teardown**

Run:
```bash
chmod +x ops/security/dynamic/target.sh
BASE=$(ops/security/dynamic/target.sh up | grep BASE_URL | cut -d= -f2-)
echo "got $BASE"; curl -fsS "$BASE/api/health"; echo " <- health ok"
curl -fsS -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d '{"email":"tester1@staging.gabee.app","password":"staging-pass"}' | head -c 120
ops/security/dynamic/target.sh down
```
Expected: health 200; login returns a JSON body with a `token` (proves migrate+fixtures worked); teardown removes containers (`docker ps` shows none named `gabee-sec-*`).

- [ ] **Step 3: Commit**

```bash
git add ops/security/dynamic/target.sh
git commit -m "feat(security): ephemeral throwaway DAST target (noop email, fresh DB + fixtures)"
```

---

## Task 4: Playwright setup + auth rate-limit / signup-abuse probes

**Files:**
- Modify: root `package.json` (add `@playwright/test` devDep)
- Create: `ops/security/dynamic/playwright.config.ts`
- Create: `ops/security/dynamic/probe-lib.ts`
- Create: `ops/security/dynamic/probes/rate-limit.spec.ts`

**Interfaces:**
- Consumes: a running target at `process.env.SEC_BASE_URL` (becomes Playwright's `baseURL`).
- Produces: `probe-lib.ts` exports `TESTERS = { A: {email:'tester1@staging.gabee.app', password:'staging-pass'}, B: {email:'tester2@staging.gabee.app', password:'staging-pass'} }` and `login(request, email, password) -> Promise<string>` (returns the JWT for `Authorization: Bearer`). Probes are Playwright `test` cases using the `request` (APIRequestContext) fixture; a failing `expect` = a block-tier dynamic finding.

- [ ] **Step 1: Install Playwright Test (no browser binaries needed yet)**

Run (node@20 on PATH):
```bash
pnpm add -D -w @playwright/test
```
Note: the HTTP probes use only the `request` fixture (APIRequestContext), which needs **no** browser download. `npx playwright install chromium` is deferred until DOM/XSS probes are added — call that out in a comment in the config.

- [ ] **Step 2: Write the Playwright config**

`ops/security/dynamic/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

// Dynamic security probes. baseURL is the ephemeral throwaway target
// (ops/security/dynamic/target.sh). Only the `request` fixture is used today, so
// no browser binaries are required; add `npx playwright install chromium` + a
// browser project here when DOM/XSS probes land.
export default defineConfig({
  testDir: './probes',
  fullyParallel: false,          // rate-limit probes share per-IP limiter state
  workers: 1,
  reporter: [['line'], ['json', { outputFile: '../../../.security/raw/playwright.json' }]],
  use: {
    baseURL: process.env.SEC_BASE_URL,
    extraHTTPHeaders: { 'content-type': 'application/json' },
  },
  projects: [{ name: 'api', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 3: Write the shared probe lib**

`ops/security/dynamic/probe-lib.ts`:
```ts
import type { APIRequestContext } from '@playwright/test';

export const TESTERS = {
  A: { email: 'tester1@staging.gabee.app', password: 'staging-pass' },
  B: { email: 'tester2@staging.gabee.app', password: 'staging-pass' },
};

// Log in and return the JWT (usable as Authorization: Bearer). Throws on non-2xx.
export async function login(request: APIRequestContext, email: string, password: string): Promise<string> {
  const r = await request.post('/api/auth/login', { data: { email, password } });
  if (!r.ok()) throw new Error(`login failed ${r.status()}`);
  return (await r.json()).token;
}
```

- [ ] **Step 4: Write the rate-limit probes**

`ops/security/dynamic/probes/rate-limit.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

// Login limiter = 5 / 5 min (apps/web/.../auth/login/route.ts). The 6th wrong
// attempt from the same IP MUST be rejected 429, not 401 — else brute-force is open.
test('auth brute-force is rate-limited (429 by the 6th attempt)', async ({ request }) => {
  let sawLimit = false;
  for (let i = 0; i < 8; i++) {
    const r = await request.post('/api/auth/login', { data: { email: 'nobody@x.io', password: `wrong-${i}` } });
    if (r.status() === 429) { sawLimit = true; break; }
    expect(r.status(), `attempt ${i}`).toBe(401);
  }
  expect(sawLimit, 'no 429 after 8 bad logins — login limiter not enforced').toBe(true);
});

// Signup limiter = 5 / 15 min. Must trip BEFORE a send; target is EMAIL_PROVIDER=noop.
test('signup abuse is rate-limited (429 before the window fills)', async ({ request }) => {
  let sawLimit = false;
  for (let i = 0; i < 8; i++) {
    const r = await request.post('/api/auth/signup', { data: { email: `sec+${i}@example.com`, password: 'Aa1!aaaaaa' } });
    if (r.status() === 429) { sawLimit = true; break; }
  }
  expect(sawLimit, 'no 429 after 8 signups — signup limiter not enforced').toBe(true);
});
```

- [ ] **Step 5: Run against a live target to verify it passes**

Run:
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
export SEC_BASE_URL=$(ops/security/dynamic/target.sh up | grep BASE_URL | cut -d= -f2-)
npx playwright test --config ops/security/dynamic/playwright.config.ts probes/rate-limit.spec.ts; RC=$?
ops/security/dynamic/target.sh down; echo "rc=$RC"
```
Expected: both probes PASS (the app enforces both limiters) → `rc=0`. A `rc!=0` means a real gap → a block-tier finding.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml ops/security/dynamic/playwright.config.ts ops/security/dynamic/probe-lib.ts ops/security/dynamic/probes/rate-limit.spec.ts
git commit -m "feat(security): Playwright probe harness + auth brute-force/signup-abuse limits"
```

---

## Task 5: IDOR / object-authz probes

**Files:**
- Create: `ops/security/dynamic/probes/idor.spec.ts`

**Interfaces:**
- Consumes: `probe-lib.ts`, a running target with seed-fixtures (tester A owns kids Ava+Noah; tester B owns Mia).

- [ ] **Step 1: Write the IDOR probes**

Tester A must not reach tester B's kid. Log in as B, list B's kids, then attempt the cross-owner mutate as A.
```ts
// ops/security/dynamic/probes/idor.spec.ts
import { test, expect, request as apiRequest } from '@playwright/test';
import { login, TESTERS } from '../probe-lib';

async function listKidIds(request: import('@playwright/test').APIRequestContext, token: string): Promise<string[]> {
  const r = await request.get('/api/profiles', { headers: { authorization: `Bearer ${token}` } });
  expect(r.status(), 'GET /api/profiles as owner').toBe(200);
  const body = await r.json();
  return (Array.isArray(body) ? body : body.profiles ?? []).map((p: any) => p.id ?? p.profile_id).filter(Boolean);
}

// Tester A PATCHing tester B's kid profile MUST NOT succeed (owner-scoped → 403/404).
test('cross-family profile IDOR is denied', async ({ request, baseURL }) => {
  const tA = await login(request, TESTERS.A.email, TESTERS.A.password);
  // separate context for B so cookies/headers don't bleed
  const ctxB = await apiRequest.newContext({ baseURL });
  const tB = await login(ctxB, TESTERS.B.email, TESTERS.B.password);
  const bKids = await listKidIds(ctxB, tB);
  expect(bKids.length, 'fixture: tester B should own a kid').toBeGreaterThan(0);
  const r = await request.patch(`/api/profiles/${bKids[0]}`, {
    headers: { authorization: `Bearer ${tA}` }, data: { display_name: 'pwned' } });
  expect([403, 404], `A editing B's kid got ${r.status()}`).toContain(r.status());
  await ctxB.dispose();
});

// Tester A reading an arbitrary message id scoped to B must be 403/404 (owner-scoped).
test('cross-family message read is denied', async ({ request }) => {
  const tA = await login(request, TESTERS.A.email, TESTERS.A.password);
  const r = await request.get('/api/messages/00000000-0000-4000-8000-0000000000ff', {
    headers: { authorization: `Bearer ${tA}` } });
  expect([403, 404], `A reading foreign message got ${r.status()}`).toContain(r.status());
});
```
> Implementer note: confirm the `GET /api/profiles` collection route + its response field for the kid id (research found `/api/profiles/[id]` has no GET, but the collection route should list the parent's kids). If the list route/field differs, adjust `listKidIds`; the invariant that matters is "A cannot touch B's id".

- [ ] **Step 2: Run against a live target**

Run (target up as in Task 4 Step 5), then:
```bash
npx playwright test --config ops/security/dynamic/playwright.config.ts probes/idor.spec.ts
```
Expected: PASS (the app scopes by `session.parentId`, so A gets 403/404 on B's objects).

- [ ] **Step 3: Commit**

```bash
git add ops/security/dynamic/probes/idor.spec.ts
git commit -m "feat(security): dynamic IDOR probes — cross-family profile + message access denied"
```

---

## Task 6: Authz-boundary probes + wire the dynamic block-tier into `scan.sh`

**Files:**
- Create: `ops/security/dynamic/probes/authz.spec.ts`
- Create: `ops/security/dynamic/run.mjs`
- Modify: `ops/security/scan.sh` (add the dynamic stage; new exit `5`)

**Interfaces:**
- Consumes: `probe-lib.ts`; the in-scope check list (via `SEC_CHECKS`); the target script.
- Produces: `run.mjs` brings the target up, runs the selected probe specs via `playwright test`, tears down, and exits `5` if any probe failed; `scan.sh` runs it when a dynamic check is in scope (or `--full`), local only, and maps a failure to exit `5`.

- [ ] **Step 1: Write the authz-boundary probes**

```ts
// ops/security/dynamic/probes/authz.spec.ts
import { test, expect } from '@playwright/test';
import { login, TESTERS } from '../probe-lib';

// A parent token on an admin route MUST be 403 (role read live from DB).
test('parent token is rejected from admin API (403)', async ({ request }) => {
  const tA = await login(request, TESTERS.A.email, TESTERS.A.password);
  const r = await request.get('/api/admin/users', { headers: { authorization: `Bearer ${tA}` } });
  expect(r.status(), 'parent on /api/admin/users').toBe(403);
});

// An unauthenticated request to a gated route MUST be 401.
test('unauthenticated request to a gated route is 401', async ({ request }) => {
  const r = await request.get('/api/profiles');
  expect(r.status(), 'anon on /api/profiles').toBe(401);
});
```

- [ ] **Step 2: Write the dynamic runner**

```js
// ops/security/dynamic/run.mjs — bring target up, run in-scope probe specs via
// Playwright, tear down. Exit 5 on any probe failure (dynamic block-tier).
import { execFileSync, spawnSync } from 'node:child_process';
const full = process.argv.includes('--full');
// In diff mode, scan.sh passes the resolved CHECKS via SEC_CHECKS (newline list).
const checks = (process.env.SEC_CHECKS ?? '').split('\n').filter(Boolean);
const wants = (c) => full || checks.includes(c);
const specs = [];
if (wants('rate-limit')) specs.push('probes/rate-limit.spec.ts');
if (wants('authz') || wants('idor')) specs.push('probes/idor.spec.ts', 'probes/authz.spec.ts');
if (specs.length === 0) { console.log('no dynamic probes in scope'); process.exit(0); }

let base;
try {
  const out = execFileSync('ops/security/dynamic/target.sh', ['up'], { encoding: 'utf8' });
  base = (out.match(/BASE_URL=(\S+)/) ?? [])[1];
  if (!base) throw new Error('no BASE_URL from target');
  const r = spawnSync('npx', ['playwright', 'test', '--config', 'ops/security/dynamic/playwright.config.ts', ...specs],
    { stdio: 'inherit', env: { ...process.env, SEC_BASE_URL: base } });
  process.exitCode = r.status === 0 ? 0 : 5;   // 5 = dynamic block-tier failure
} finally {
  try { execFileSync('ops/security/dynamic/target.sh', ['down'], { stdio: 'ignore' }); } catch {}
}
```

- [ ] **Step 3: Add the dynamic stage to `scan.sh` (local only)**

After the static aggregation, before the final verdict:
```bash
# ── dynamic probes (LOCAL ONLY — needs Docker + a live throwaway target) ──
# Skipped in CI (no target) and skippable with --no-dynamic. A failing authz/
# IDOR/rate-limit probe is block-tier → exit 5.
DYN_BLOCK=0
if [ "${NO_DYNAMIC:-0}" -eq 0 ] && { echo "$CHECKS" | grep -qxE 'rate-limit|idor|authz' || [ "$FULL" -eq 1 ]; }; then
  if have docker; then
    SEC_CHECKS="$CHECKS" node ops/security/dynamic/run.mjs $( [ "$FULL" -eq 1 ] && echo --full ) \
      && note "- dynamic: probes passed" || { note "- dynamic: PROBE FAILURE (block)"; DYN_BLOCK=1; }
  else note "- dynamic: skipped (docker not available)"; fi
fi
```
Add `--no-dynamic) NO_DYNAMIC=1; shift;;` to the arg parser. In the final verdict, after the static exit-1 check: `if [ "$DYN_BLOCK" -eq 1 ]; then note "RESULT: BLOCK (dynamic)"; exit 5; fi`.

- [ ] **Step 4: End-to-end test**

Run:
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
pnpm security:scan --full; echo "exit=$?"        # runs static + dynamic; expect 0 (clean app)
pnpm security:scan --full --no-dynamic; echo "exit=$?"  # static only; faster
```
Expected: `--full` brings the target up, runs all probes, tears down, exits 0 on a healthy app; `--no-dynamic` skips the target entirely. Confirm no `gabee-sec-*` containers linger (`docker ps -a | grep gabee-sec` empty).

- [ ] **Step 5: Commit**

```bash
git add ops/security/dynamic/probes/authz.spec.ts ops/security/dynamic/run.mjs ops/security/scan.sh
git commit -m "feat(security): authz-boundary probes + wire dynamic block-tier into security:scan (exit 5)"
```

---

## Task 7: Local AI threat-review (advisory)

**Files:**
- Create: `ops/security/ai-review.mjs`
- Modify: `ops/security/scan.sh` (add the advisory AI stage, local only)

**Interfaces:**
- Consumes: `git diff <ref>..HEAD`, `docs/security/threat-model.md`, the in-scope check list; the `claude` CLI (`-p --output-format json`).
- Produces: advisory findings printed to the report; NEVER changes the exit code; graceful skip if `claude` is absent.

- [ ] **Step 1: Write the AI-review script**

```js
// ops/security/ai-review.mjs — advisory, local-only. Reads the diff + threat model,
// asks claude for per-vector risks in the changed code, prints them as advisory notes.
// Missing `claude` CLI or any error → skip (never fail the gate).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const ref = process.argv[2] || '';
function have(cmd) { try { execFileSync('command', ['-v', cmd], { shell: '/bin/bash' }); return true; } catch { return false; } }
try {
  execFileSync('claude', ['--version'], { stdio: 'ignore' });
} catch { console.log('- ai-review: skipped (claude CLI not found)'); process.exit(0); }
try {
  const range = ref ? `${ref}..HEAD` : 'HEAD~1..HEAD';
  const diff = execFileSync('git', ['diff', range, '--'], { encoding: 'utf8' }).slice(0, 60000);
  const model = readFileSync('docs/security/threat-model.md', 'utf8').slice(0, 40000);
  const prompt = `You are a security reviewer. Given this Gabee threat model and a release diff, list ONLY concrete, high-signal risks introduced by the diff, per threat-model vector id. Output STRICT JSON: {"findings":[{"vector":"app-authz-idor","severity":"high|med|low","scenario":"..."}]}. No prose.\n\n# THREAT MODEL\n${model}\n\n# DIFF\n${diff}`;
  const out = execFileSync('claude', ['-p', prompt, '--output-format', 'json'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const parsed = JSON.parse(out);
  const text = parsed.result ?? parsed.text ?? out;
  const findings = JSON.parse(text).findings ?? [];
  if (findings.length === 0) console.log('- ai-review: no risks flagged');
  for (const f of findings) console.log(`- ai-note [${f.severity}] ${f.vector}: ${f.scenario}`);
} catch (e) { console.log(`- ai-review: skipped (${String(e.message).split('\n')[0]})`); }
process.exit(0); // advisory: never fails the gate
```
> Implementer note: confirm the `claude -p --output-format json` envelope on the first run (the top-level key holding the model text may be `result`); adjust the `parsed.result ?? parsed.text` extraction to match. The wrapper already tolerates a parse failure by skipping, so a wrong guess degrades to "skipped", never a false block.

- [ ] **Step 2: Add the advisory AI stage to `scan.sh`**

After the dynamic stage, before the verdict (local only, never blocks):
```bash
# ── AI threat-review (LOCAL ONLY, advisory — never blocks, never in CI) ──
if [ "${NO_AI:-0}" -eq 0 ]; then
  note "## AI threat-review (advisory)"
  node ops/security/ai-review.mjs "$SINCE" | tee -a "$REPORT" || true
fi
```
Add `--no-ai) NO_AI=1; shift;;` to the arg parser.

- [ ] **Step 3: Test the skip path + (if available) a real run**

Run:
```bash
PATH=/usr/bin:/bin node ops/security/ai-review.mjs   # claude not on PATH → prints "skipped", exit 0
echo "skip-exit=$?"
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
command -v claude && node ops/security/ai-review.mjs HEAD~3 || echo "(claude not installed — skip real run)"
```
Expected: skip path prints `ai-review: skipped (...)` and exits 0. If `claude` is installed, a real run prints advisory notes (or "no risks flagged") and exits 0.

- [ ] **Step 4: Commit**

```bash
git add ops/security/ai-review.mjs ops/security/scan.sh
git commit -m "feat(security): local advisory AI threat-review over the release diff"
```

---

## Task 8: Runbook update + first full sweep + triage

**Files:**
- Modify: `docs/security/review-process.md`
- Create: `docs/security/first-sweep-2026-07.md`

- [ ] **Step 1: Document the dynamic + AI stages in the runbook**

Add sections to `docs/security/review-process.md`: (a) **Dynamic probes** — what they test (auth rate-limit, signup abuse, IDOR, authz boundaries), that they spin up a throwaway target (`ops/security/dynamic/target.sh`, noop email + fresh DB + fixtures), require Docker, are local-only (not CI), and are skippable with `--no-dynamic`; the exit-`5` dynamic-block code; the **opt-in safe-subset staging smoke** (IDOR/authz read-only assertions only — never the rate-limit/signup probes that mutate/flood — via `SEC_BASE_URL=https://staging.gabee.app npx playwright test --config ops/security/dynamic/playwright.config.ts probes/idor.spec.ts probes/authz.spec.ts`). (b) **AI review** — advisory, local-only, needs the `claude` CLI, never blocks, `--no-ai` to skip. (c) Update the exit-code table with `5`.

- [ ] **Step 2: Run the first full sweep**

Run:
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
pnpm security:scan --full 2>&1 | tee .security/first-sweep.log; echo "exit=$?"
```
Capture every finding (static blockers, waived, advisory, dynamic, AI notes).

- [ ] **Step 3: Triage into `docs/security/first-sweep-2026-07.md`**

For each finding, record: fingerprint/probe, tier, and **disposition** — one of *fix now* (with the file+change), *waive* (add an accountable entry to `security-waivers.yml` with reason/approver/expiry + link the reason), or *backlog* (a threat-model row + a note). Expected real gaps per the spec: endpoints lacking rate-limiting, any Trivy compose HIGH, dependency CVEs. Do NOT fix app code in this task beyond adding waivers/backlog entries — surface and route, don't scope-creep into fixes.

- [ ] **Step 4: Commit**

```bash
git add docs/security/review-process.md docs/security/first-sweep-2026-07.md security-waivers.yml
git commit -m "docs(security): dynamic+AI runbook + first full-sweep triage"
```

---

## Self-Review

**Spec coverage** (design §3 dynamic, §3 AI, §5 waivers, rollout 3–6):
- Dynamic probe suite (auth rate-limit, signup abuse, IDOR, authz boundaries) → Tasks 4–6. ✅
- Ephemeral throwaway target (noop email, fresh DB, fixtures, torn down) → Task 3. ✅
- Optional safe-subset staging smoke → Task 8 Step 1 (documented + the idor/authz files are runnable against any `SEC_BASE_URL`). ✅
- AI threat-review (diff-scoped, local-only, advisory) → Task 7. ✅
- Per-finding waiver wiring (the Plan 1 deferral) → Tasks 1–2. ✅
- Dynamic block-tier into `security:scan` → Task 6. ✅
- First full sweep + triage → Task 8. ✅
- Safety rule (never prod / never real provider) → Global Constraints + Task 3 guard. ✅
- **Probe framework:** Playwright Test (per the spec), using the `request`/APIRequestContext fixture for today's HTTP-level assertions; the browser `page` fixture and `npx playwright install chromium` are ready for future DOM/XSS probes without restructuring.

**Placeholder scan:** none — every step has real code/commands. The two "implementer note" callouts (target migrate/seed fallback in Task 3; the `claude -p` JSON envelope key in Task 7) are explicit first-run confirmations with a stated fallback, not TODOs.

**Type consistency:** `Finding` shape + fingerprint formats defined in Task 1 are consumed verbatim by `aggregate.mjs` (Task 2) and `run.mjs` (Task 6). `applyWaivers(findings, waivers)` matches the Plan 1 signature (`ops/security/waivers.mjs`). `TESTERS` + `login(request, email, password)` defined in Task 4's `probe-lib.ts` are imported unchanged by Tasks 5–6; probes use Playwright's `request` fixture + `baseURL` from `SEC_BASE_URL`. Exit codes 0–4 preserved from Plan 1; `5` added consistently in `run.mjs`, `scan.sh`, and the runbook.
