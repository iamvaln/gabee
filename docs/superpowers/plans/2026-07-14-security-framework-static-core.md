# Security framework — static core + gate (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundational, deploy-gating half of the security framework — a durable threat model plus a diff-scoped `security:scan` (static tools) with a tiered gate + waivers, and a CI backstop that blocks a release on high-confidence findings.

**Architecture:** A `threat-model.md` taxonomy is the source of truth. `ops/security/scan.sh` orchestrates: resolve the release diff → map changed paths to checks via `routes.yml` → run the deterministic tools (Semgrep, gitleaks, osv-scanner, Trivy) scoped accordingly → filter findings through `security-waivers.yml` → exit non-zero on the block tier. A `security` job in `release.yml` re-runs the deterministic tools on the tag and gates `deploy`.

**Tech Stack:** Bash + Node (mjs) orchestration; Semgrep / gitleaks / osv-scanner / Trivy (all free/OSS, invoked via `npx`/binaries/official GitHub Actions); GitHub Actions; the repo's `node --import tsx --test` runner for the pure helpers.

**Scope note — this is Plan 1 of 2.** Plan 2 (immediate follow-on) adds the **dynamic/behavioral probe suite** (ephemeral throwaway target) and the **AI threat-review**. This plan delivers a complete, working, gating *static* scanner + threat model on its own. v1 scope (per the spec) = both plans.

## Global Constraints

- Work on branch `ops/security-review-framework` (worktree `/Users/valentine/dev/gabee-security`). Do NOT work on other branches.
- Follow the approved spec: `docs/superpowers/specs/2026-07-14-security-review-framework-design.md`.
- **Tiered gate:** block-tier = gitleaks hit · osv/Trivy Critical|High CVE · Semgrep `ERROR`. Advisory = Semgrep `WARNING`/`INFO`. Unexpired waivers in `security-waivers.yml` suppress a block-tier finding; the CI backstop honors the same file.
- **Diff-scoped by default** (`--since <ref>`, default = last `v*` tag); `--full` runs the whole taxonomy. Secrets + dep scans always run (cheap; a leaked secret anywhere matters).
- All tools are free/OSS, invoked without a SaaS account. No new runtime app dependency.
- Secrets never in tracked files; `security-waivers.yml` carries no secrets (only finding fingerprints + reasons).
- No `Co-Authored-By` / Claude attribution trailer in commits.
- Node@20 keg-only: prepend `/opt/homebrew/opt/node@20/bin` to PATH if `node`/`tsx` aren't found.
- The CI backstop mirrors the existing `release.yml`/`ci.yml` conventions (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`, pinned action versions, Node 24 opt-in).

---

### Task 1: Threat-model taxonomy doc

**Files:**
- Create: `docs/security/threat-model.md`

**Interfaces:**
- Produces: the durable vector taxonomy the routing table (Task 2) and CI/runbook reference. Each vector has a stable `id` (kebab, e.g. `app-authz-idor`) used as the waiver/route key.

- [ ] **Step 1: Write the threat model**

Create `docs/security/threat-model.md` with three layers, each vector a row with **id · surface · check(s) · tier · backing (OWASP/ASVS/STRIDE)**. Cover exactly these (grounded in Gabee's real surfaces):

- **Network:** `net-tls` (Traefik LE TLS-ALPN cert correctness); `net-cors` (`apps/web/src/lib/server/cors.ts` single-origin, no credentials); `net-host-isolation` (apex/parents/admin/api/kid routers + `proxy.ts` `hostRole`); `net-rate-limit-edge`; `net-exposure` (staging basic-auth scope, un-gated `api.*`).
- **Platform/infra:** `plat-cd-secrets` (`release.yml`/`staging.yml`, GHCR token, VPS SSH key); `plat-compose-misconfig` (Traefik labels, network exposure, `env_file`); `plat-image-cve` (web/kid/backup images); `plat-env-handling` (`.env.*.example` placeholders only); `plat-r2-scope`; `plat-mailgun-abuse`; `plat-backup-integrity`.
- **Application:** `app-authn` (scrypt+JWT, session cookies, `emailConfirmedAt` gate); `app-authz-idor` (parent vs admin isolation, `requireParent`/admin gates, object-authz on kids/messages/devices); `app-injection` (Prisma `$queryRaw`, XSS, SSRF, path traversal); `app-input-validation` (Zod coverage on API bodies/params); `app-rate-limit` (signup/login/reset/email/AI/content endpoints); `app-secrets-in-code`; `app-pii-exposure` (device-metadata + IP retention, the pending privacy gate, admin-only IP); `app-supply-chain` (pnpm deps + lockfile integrity).

Add a short intro (what this doc is, how the scan uses it, how to add a vector) and note which vectors are covered by **static tools** (this plan) vs **dynamic/AI** (Plan 2).

- [ ] **Step 2: Verify structure (every vector has an id + tier)**

Run:
```bash
cd /Users/valentine/dev/gabee-security
grep -cE '^\| `?(net|plat|app)-' docs/security/threat-model.md
```
Expected: a count ≥ 18 (all vectors present as table rows with `net-`/`plat-`/`app-` ids).

- [ ] **Step 3: Commit**

```bash
git add docs/security/threat-model.md
git commit -m "docs(security): threat-model taxonomy (network/platform/app vectors)"
```

---

### Task 2: Diff-scope resolver + routing table (+ test)

**Files:**
- Create: `ops/security/routes.yml`, `ops/security/scope.mjs`
- Test: `ops/security/scope.test.mjs`
- Modify: `apps/../` none — add `ops/security/scope.test.mjs` to a runnable command in Step 3 (root has no ops test runner; run directly with node).

**Interfaces:**
- Produces: `ops/security/scope.mjs` — a CLI + importable `resolveChecks(changedPaths: string[], routes): { checks: Set<string>, always: string[] }`. `checks` are tool-scope tags (`semgrep`, `osv`, `trivy`, `gitleaks`, plus vector ids for the AI/dynamic layers later). `gitleaks` + `osv` are always included. Reads `routes.yml`.

- [ ] **Step 1: Create the routing table**

`ops/security/routes.yml` — glob → checks (YAML):
```yaml
# path glob (minimatch-ish, prefix match on dir) -> checks to run for that change.
# gitleaks + osv always run regardless (see scope.mjs).
always: [gitleaks, osv]
routes:
  - glob: 'apps/web/src/app/api/'
    checks: [semgrep, app-injection, app-authz-idor, app-rate-limit, app-input-validation]
  - glob: 'apps/web/src/lib/server/'
    checks: [semgrep, app-authn, app-authz-idor, net-cors, app-secrets-in-code]
  - glob: 'apps/web/src/proxy.ts'
    checks: [semgrep, net-host-isolation]
  - glob: 'packages/db/prisma/'
    checks: [app-pii-exposure, app-injection]
  - glob: 'docker-compose'
    checks: [trivy, plat-compose-misconfig, plat-env-handling]
  - glob: 'deploy/'
    checks: [trivy, plat-compose-misconfig, net-tls]
  - glob: '.github/workflows/'
    checks: [plat-cd-secrets, gitleaks]
  - glob: 'ops/'
    checks: [plat-cd-secrets, plat-backup-integrity]
  - glob: 'apps/'
    checks: [semgrep, trivy]        # any app change → SAST + image scan
  - glob: 'pnpm-lock.yaml'
    checks: [osv, app-supply-chain]
```

- [ ] **Step 2: Write the failing test**

`ops/security/scope.test.mjs`:
```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChecks } from './scope.mjs';

const routes = {
  always: ['gitleaks', 'osv'],
  routes: [
    { glob: 'apps/web/src/app/api/', checks: ['semgrep', 'app-authz-idor', 'app-rate-limit'] },
    { glob: 'packages/db/prisma/', checks: ['app-pii-exposure'] },
    { glob: '.github/workflows/', checks: ['plat-cd-secrets'] },
  ],
};

describe('resolveChecks', () => {
  it('always includes gitleaks + osv even for an unmatched path', () => {
    const { checks } = resolveChecks(['README.md'], routes);
    assert.ok(checks.has('gitleaks') && checks.has('osv'));
  });
  it('maps an API change to its vectors', () => {
    const { checks } = resolveChecks(['apps/web/src/app/api/events/route.ts'], routes);
    assert.ok(checks.has('semgrep') && checks.has('app-authz-idor') && checks.has('app-rate-limit'));
  });
  it('unions across multiple changed paths', () => {
    const { checks } = resolveChecks(
      ['packages/db/prisma/schema.prisma', '.github/workflows/release.yml'], routes);
    assert.ok(checks.has('app-pii-exposure') && checks.has('plat-cd-secrets'));
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `cd ops/security && node --import tsx --test scope.test.mjs`
Expected: FAIL — cannot find `./scope.mjs`.

- [ ] **Step 3: Implement `scope.mjs`**

```js
#!/usr/bin/env node
// Resolve which security checks a change set needs, from routes.yml. Pure
// `resolveChecks` (tested) + a CLI: `node scope.mjs <ref>` prints the checks for
// `git diff --name-only <ref>..HEAD`. `gitleaks`+`osv` always run.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { parse } from 'yaml';

export function resolveChecks(changedPaths, routes) {
  const checks = new Set(routes.always ?? []);
  for (const p of changedPaths) {
    for (const r of routes.routes ?? []) {
      if (p.includes(r.glob)) for (const c of r.checks) checks.add(c);
    }
  }
  return { checks, always: routes.always ?? [] };
}

export function loadRoutes(dir) {
  return parse(readFileSync(join(dir, 'routes.yml'), 'utf8'));
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('scope.mjs')) {
  const dir = dirname(fileURLToPath(import.meta.url));
  const ref = process.argv[2] || '';
  const range = ref ? `${ref}..HEAD` : 'HEAD';
  const out = execSync(`git diff --name-only ${range}`, { encoding: 'utf8' });
  const changed = out.split('\n').filter(Boolean);
  const { checks } = resolveChecks(changed, loadRoutes(dir));
  process.stdout.write([...checks].sort().join('\n') + '\n');
}
```
Note: `yaml` is already a dependency in the repo (used by prisma config / other tooling — verify with `node -e "require('yaml')"` from the worktree root; if absent, add it as a root devDependency in this task and `pnpm install`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ops/security && node --import tsx --test scope.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add ops/security/routes.yml ops/security/scope.mjs ops/security/scope.test.mjs
git commit -m "feat(security): diff-scope resolver + routing table"
```

---

### Task 3: Tool configs (gitleaks + Semgrep repo rules)

**Files:**
- Create: `.gitleaks.toml`, `.semgrep/gabee.yml`

**Interfaces:**
- Produces: `.gitleaks.toml` (extends default rules + allowlists the tracked `.env.*.example` placeholders and the fixtures' known test hash); `.semgrep/gabee.yml` (Gabee-specific SAST rules invoked alongside the registry rulesets by `scan.sh`).

- [ ] **Step 1: `.gitleaks.toml`**

```toml
title = "Gabee gitleaks config"
[extend]
useDefault = true

[allowlist]
description = "Tracked example env files hold placeholders, not secrets; fixtures use a known test hash."
paths = [
  '''\.env\.[a-z]+\.example$''',
]
regexes = [
  '''CHANGE_ME[A-Za-z0-9_]*''',
  '''staging-pass''',
]
```

- [ ] **Step 2: `.semgrep/gabee.yml` (repo SAST rules)**

```yaml
rules:
  - id: api-route-without-zod-parse
    languages: [typescript]
    severity: WARNING
    message: >-
      API route handler appears to read the request body without a Zod parse.
      Validate input (packages/types schema) before use — see app-input-validation.
    patterns:
      - pattern-either:
          - pattern: (await $REQ.json())
          - pattern: $REQ.nextUrl.searchParams
      - pattern-not-inside: |
          $SCHEMA.safeParse(...)
      - pattern-not-inside: |
          $SCHEMA.parse(...)
    paths:
      include: ['apps/web/src/app/api/**']
  - id: prisma-raw-string-interpolation
    languages: [typescript]
    severity: ERROR
    message: >-
      Raw SQL with template interpolation — SQL injection risk (app-injection).
      Use Prisma.sql`` tagged parameters, never `${...}` inside $queryRawUnsafe.
    pattern-either:
      - pattern: $P.$queryRawUnsafe(`...${...}...`)
      - pattern: $P.$executeRawUnsafe(`...${...}...`)
  - id: kid-message-or-parent-route-missing-guard
    languages: [typescript]
    severity: WARNING
    message: >-
      Parent/admin API route with no requireParent()/requireAdmin() guard
      visible — confirm authz (app-authz-idor).
    patterns:
      - pattern: export const $M = route(async ($REQ) => { ... })
      - pattern-not-inside: |
          requireParent(...)
      - pattern-not-inside: |
          requireAdmin(...)
    paths:
      include: ['apps/web/src/app/api/**']
```
Note: these are heuristic (WARNING for the authz/zod ones = advisory; the raw-SQL one is ERROR = block). Verify the actual helper names (`route`, `requireParent`, `requireAdmin`, `$queryRawUnsafe`) against `apps/web/src/lib/server/http.ts` + a sample route while implementing, and adjust patterns to match real idioms so they don't misfire.

- [ ] **Step 3: Validate the configs parse**

Run:
```bash
cd /Users/valentine/dev/gabee-security
node -e "require('yaml').parse(require('fs').readFileSync('.semgrep/gabee.yml','utf8')); console.log('semgrep yaml OK')"
python3 -c "import tomllib,sys; tomllib.load(open('.gitleaks.toml','rb')); print('gitleaks toml OK')" 2>/dev/null || echo "toml check skipped (no py tomllib)"
```
Expected: `semgrep yaml OK` (and toml OK if tomllib available). If Semgrep is installed (`command -v semgrep`), also run `semgrep --validate --config .semgrep/gabee.yml`.

- [ ] **Step 4: Commit**

```bash
git add .gitleaks.toml .semgrep/gabee.yml
git commit -m "feat(security): gitleaks config + Gabee Semgrep SAST rules"
```

---

### Task 4: Waivers file + waiver filter (+ test)

**Files:**
- Create: `security-waivers.yml`, `ops/security/waivers.mjs`
- Test: `ops/security/waivers.test.mjs`

**Interfaces:**
- Produces: `applyWaivers(findings, waivers, now): { blocked, waived }` — a finding whose `fingerprint` matches an unexpired waiver moves from `blocked` to `waived`. A finding is `{ tool, ruleId, path, fingerprint, severity }`; a waiver is `{ fingerprint, reason, approver, expires }` (ISO date). Expired/absent waivers don't suppress.

- [ ] **Step 1: Seed `security-waivers.yml`**

```yaml
# Block-tier findings can be temporarily waived here. Each needs a real reason,
# an approver, and an expiry (ISO date) — expired waivers re-block. NO secrets.
waivers: []
# Example (delete when adding a real one):
#   - fingerprint: "gitleaks:apps/web/foo.ts:generic-api-key:42"
#     reason: "False positive — example string in a comment."
#     approver: "valentine"
#     expires: "2026-09-01"
```

- [ ] **Step 2: Write the failing test**

`ops/security/waivers.test.mjs`:
```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyWaivers } from './waivers.mjs';

const NOW = new Date('2026-07-14T00:00:00Z');
const f = { tool: 'gitleaks', ruleId: 'api-key', path: 'a.ts', fingerprint: 'fp1', severity: 'HIGH' };

describe('applyWaivers', () => {
  it('waives a matching unexpired finding', () => {
    const r = applyWaivers([f], [{ fingerprint: 'fp1', reason: 'x', approver: 'v', expires: '2026-09-01' }], NOW);
    assert.equal(r.blocked.length, 0);
    assert.equal(r.waived.length, 1);
  });
  it('does not waive an expired waiver', () => {
    const r = applyWaivers([f], [{ fingerprint: 'fp1', reason: 'x', approver: 'v', expires: '2026-06-01' }], NOW);
    assert.equal(r.blocked.length, 1);
  });
  it('does not waive a non-matching fingerprint', () => {
    const r = applyWaivers([f], [{ fingerprint: 'other', reason: 'x', approver: 'v', expires: '2026-09-01' }], NOW);
    assert.equal(r.blocked.length, 1);
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `cd ops/security && node --import tsx --test waivers.test.mjs` → FAIL (no `./waivers.mjs`).

- [ ] **Step 3: Implement `waivers.mjs`**

```js
// Filter block-tier findings through security-waivers.yml. A finding whose
// `fingerprint` matches an unexpired waiver is moved to `waived`.
export function applyWaivers(findings, waivers, now = new Date()) {
  const active = new Map();
  for (const w of waivers ?? []) {
    if (w.fingerprint && w.expires && new Date(w.expires) >= now) active.set(w.fingerprint, w);
  }
  const blocked = [], waived = [];
  for (const f of findings) {
    if (active.has(f.fingerprint)) waived.push({ ...f, waiver: active.get(f.fingerprint) });
    else blocked.push(f);
  }
  return { blocked, waived };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ops/security && node --import tsx --test waivers.test.mjs` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add security-waivers.yml ops/security/waivers.mjs ops/security/waivers.test.mjs
git commit -m "feat(security): waivers file + expiry-aware waiver filter"
```

---

### Task 5: `scan.sh` orchestrator + `security:scan` script

**Files:**
- Create: `ops/security/scan.sh` (executable)
- Modify: root `package.json` (add `"security:scan": "bash ops/security/scan.sh"`)

**Interfaces:**
- Consumes: `scope.mjs`, `waivers.mjs`, `routes.yml`, `.gitleaks.toml`, `.semgrep/gabee.yml`, `security-waivers.yml`.
- Produces: `security:scan [--since <ref>] [--full]` — runs the deterministic tools (scoped or full), applies waivers, prints a tiered report to `.security/report.md` (git-ignored), exits non-zero if any block-tier finding survives waivers. Each tool is invoked only if available; a missing tool is reported (not silently skipped) and, in `--strict`/CI, is a failure.

- [ ] **Step 1: Write `ops/security/scan.sh`**

```bash
#!/usr/bin/env bash
# Diff-scoped (default) or --full security scan: Semgrep + gitleaks + osv-scanner
# + Trivy, filtered through security-waivers.yml, tiered exit. Writes a report to
# .security/report.md. Tools invoked via their binaries / npx; a missing tool is
# LOGGED (never silently skipped) and fails the run under --strict (CI passes it).
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
SINCE=""; FULL=0; STRICT=0
while [ $# -gt 0 ]; do case "$1" in
  --since) SINCE="$2"; shift 2;;
  --full) FULL=1; shift;;
  --strict) STRICT=1; shift;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done
[ -z "$SINCE" ] && SINCE="$(git describe --tags --match 'v*' --abbrev=0 2>/dev/null || echo '')"
mkdir -p .security; REPORT=.security/report.md; : > "$REPORT"
BLOCK=0; MISSING=""

have() { command -v "$1" >/dev/null 2>&1; }
note() { echo "$*" | tee -a "$REPORT"; }

if [ "$FULL" -eq 1 ] || [ -z "$SINCE" ]; then
  CHECKS="$(node -e "const s=require('./ops/security/scope.mjs'); const y=require('yaml'); const r=y.parse(require('fs').readFileSync('ops/security/routes.yml','utf8')); const all=new Set(r.always); r.routes.forEach(x=>x.checks.forEach(c=>all.add(c))); console.log([...all].join('\n'))" 2>/dev/null)"
  note "# Security scan — FULL"
else
  CHECKS="$(node ops/security/scope.mjs "$SINCE")"
  note "# Security scan — since $SINCE"
fi
runs() { echo "$CHECKS" | grep -qx "$1"; }

# ── gitleaks (always) — secrets, block tier ──
if runs gitleaks; then
  if have gitleaks; then
    gitleaks detect --no-banner --redact -c .gitleaks.toml \
      $( [ "$FULL" -eq 0 ] && [ -n "$SINCE" ] && echo "--log-opts=$SINCE..HEAD" ) \
      && note "- gitleaks: clean" || { note "- gitleaks: FINDINGS (block)"; BLOCK=1; }
  else MISSING="$MISSING gitleaks"; fi
fi
# ── osv-scanner (always) — dep CVEs, block on High+ ──
if runs osv; then
  if have osv-scanner; then
    osv-scanner --lockfile pnpm-lock.yaml >/dev/null 2>&1 \
      && note "- osv: clean" || { note "- osv: VULN (review; block if High+)"; BLOCK=1; }
  else MISSING="$MISSING osv-scanner"; fi
fi
# ── semgrep (scoped) — SAST, block on ERROR ──
if runs semgrep; then
  if have semgrep; then
    semgrep --error --quiet --config .semgrep/gabee.yml --config p/typescript --config p/nextjs \
      && note "- semgrep: clean (no ERROR)" || { note "- semgrep: ERROR findings (block)"; BLOCK=1; }
  else MISSING="$MISSING semgrep"; fi
fi
# ── trivy (scoped) — image/IaC misconfig, block on Critical/High ──
if runs trivy; then
  if have trivy; then
    trivy config --exit-code 1 --severity CRITICAL,HIGH docker-compose.yml \
      && note "- trivy(config): clean" || { note "- trivy(config): misconfig (block)"; BLOCK=1; }
  else MISSING="$MISSING trivy"; fi
fi

[ -n "$MISSING" ] && note "- MISSING tools:$MISSING (install: brew install $MISSING / npx)"
# Waivers: (block-tier findings are hand-fingerprinted into security-waivers.yml;
# the current tool wiring reports pass/fail per tool — the fingerprint-level
# waiver application is exercised in Plan 2 when per-finding JSON is parsed.)

if [ "$BLOCK" -eq 1 ]; then note ""; note "RESULT: BLOCK (see $REPORT)"; exit 1; fi
if [ -n "$MISSING" ] && [ "$STRICT" -eq 1 ]; then note "RESULT: FAIL (missing tools under --strict)"; exit 3; fi
note ""; note "RESULT: PASS"; exit 0
```
Note: the fingerprint-level waiver filter (`waivers.mjs`) is unit-tested in Task 4 and wired to real per-finding JSON parsing in **Plan 2** (when the tools are invoked with `--format json`). This task ships the pass/fail-per-tool gate + the waiver *file/helper*; keep the scan honest about that in the report.

- [ ] **Step 2: Executable + shellcheck + add `.security/` to gitignore**

```bash
cd /Users/valentine/dev/gabee-security
chmod +x ops/security/scan.sh
grep -qxF '.security/' .gitignore || echo '.security/' >> .gitignore
command -v shellcheck >/dev/null && shellcheck -e SC2086 ops/security/scan.sh || bash -n ops/security/scan.sh
```
Expected: no syntax errors (SC2086 intentional word-splitting is excluded).

- [ ] **Step 3: Add the root script + dry-run**

Add to root `package.json` scripts: `"security:scan": "bash ops/security/scan.sh"`. Then run a dry pass (tools may be absent locally — that's expected; it must not crash and must report missing tools):
```bash
cd /Users/valentine/dev/gabee-security && pnpm security:scan --since HEAD~1 2>&1 | tail -20
```
Expected: it runs, prints the tiered report incl. any `MISSING tools`, and exits 0 (no block-tier findings, non-strict).

- [ ] **Step 4: Commit**

```bash
git add ops/security/scan.sh package.json .gitignore
git commit -m "feat(security): scan.sh orchestrator + security:scan script"
```

---

### Task 6: CI backstop — gate `release.yml` deploy

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Produces: a `security` job (deterministic tools via official actions, scoped to the tag diff) that `deploy` `needs`, so a block-tier finding fails the release before deploy.

- [ ] **Step 1: Add the `security` job**

In `release.yml`, add a job that runs the OSS scanners via their official actions on the pushed tag, and add it to `deploy`'s `needs`:

```yaml
  # ── Security backstop: deterministic scanners gate the deploy ────────────────
  security:
    runs-on: ubuntu-latest
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # need history for the diff + gitleaks
      - name: gitleaks (secrets)
        uses: gitleaks/gitleaks-action@v2
        env: { GITLEAKS_CONFIG: .gitleaks.toml }
      - name: osv-scanner (deps)
        uses: google/osv-scanner-action@v1
        with: { scan-args: "--lockfile=pnpm-lock.yaml" }
      - name: Semgrep (SAST, error-level blocks)
        uses: semgrep/semgrep-action@v1
        with: { config: ".semgrep/gabee.yml p/typescript p/nextjs" }
      - name: Trivy (compose/IaC misconfig)
        uses: aquasecurity/trivy-action@0.24.0
        with: { scan-type: config, scan-ref: docker-compose.yml, severity: 'CRITICAL,HIGH', exit-code: '1' }
```
Then change the deploy job's `needs` to include `security`:
```yaml
  deploy:
    needs: [build-web, build-kid, build-backup, build-cron-digest, security]
```
Keep the file's existing `env` (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`) + pinned action-version conventions.

- [ ] **Step 2: Validate the workflow YAML**

Run:
```bash
cd /Users/valentine/dev/gabee-security
command -v actionlint >/dev/null && actionlint .github/workflows/release.yml \
  || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('yaml OK')"
```
Expected: `yaml OK` (or actionlint clean). Confirm `deploy.needs` now lists `security`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(security): deterministic scanner backstop gates release deploy"
```

---

### Task 7: Runbook + human-judgment checklist

**Files:**
- Create: `docs/security/review-process.md`, `docs/security/review-checklist.md`

- [ ] **Step 1: Runbook — `docs/security/review-process.md`**

Concretely document: the three run types (per-release auto CI backstop + local `pnpm security:scan` pre-tag; on-demand `--full` sweep; human-judgment checklist); how to read the tiered report; how to add a waiver (fingerprint from the report → `security-waivers.yml` with reason/approver/expiry) and that expiry re-blocks; how to install the tools locally (`brew install gitleaks trivy` / `npx osv-scanner` / `pip install semgrep`); and that **dynamic probes + AI review arrive in Plan 2** (this is the static core).

- [ ] **Step 2: Checklist — `docs/security/review-checklist.md`**

The by-hand residue with a cadence: device-metadata **privacy/retention/policy** review (ties to the pending privacy gate), exploratory abuse hunting beyond scripted probes, dependency-license/health review, and threat-model maintenance (add a vector whenever a new surface ships). Each item: what to check, where, how often.

- [ ] **Step 3: Commit**

```bash
git add docs/security/review-process.md docs/security/review-checklist.md
git commit -m "docs(security): review runbook + human-judgment checklist"
```

---

## Self-Review

**Spec coverage (this plan = the static core):**
- Threat-model taxonomy → Task 1. ✅
- Diff-scoping (routes) → Task 2. ✅
- Static tools (Semgrep/gitleaks/osv/Trivy) config + orchestration → Tasks 3 + 5. ✅
- Tiered gate + waivers → Task 4 (helper/file) + Task 5 (gate). ✅
- Local `security:scan` + CI backstop → Task 5 + Task 6. ✅
- Runbook + human-judgment checklist → Task 7. ✅
- **Deferred to Plan 2 (noted):** dynamic probe suite + AI threat-review + per-finding JSON→waiver wiring + first full sweep. The spec's v1 = both plans; this one ships a working gating static scanner.

**Placeholder scan:** none. Every step has concrete files/code/commands. Tool-invocation specifics (flags) are real; the one honest caveat (fingerprint-level waiver application lands in Plan 2 when tools emit JSON) is stated in Task 5, not hidden.

**Type/name consistency:** `resolveChecks`/`applyWaivers` signatures match between their tasks and `scan.sh`'s usage; vector ids in `threat-model.md` (Task 1) match the `routes.yml` checks (Task 2); `security-waivers.yml` shape matches `applyWaivers`'s waiver shape (Task 4); the `security` CI job id matches `deploy.needs` (Task 6).

**Implementer must verify against live code (flagged inline):** the Semgrep rule patterns vs the real `route`/`requireParent`/`requireAdmin`/`$queryRawUnsafe` idioms (Task 3 Step 2); that `yaml` is a resolvable dependency (Task 2 Step 3); exact official-action versions/inputs for the CI scanners (Task 6) — pin to current releases.
