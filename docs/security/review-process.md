# Security review runbook

How to run the security gate, read its report, and waive a finding. The gate has
three stages: a **static deterministic core** (Semgrep/gitleaks/osv/Trivy, always
runs, CI backstop), **local-only dynamic probes** (throwaway target + Playwright,
block-tier), and a **local-only advisory AI review** (never blocks). Per-finding
fingerprint→waiver application is fully wired for all four static tools.

## Run it locally

```bash
pnpm security:scan            # → bash ops/security/scan.sh
```

Diff-scoped by default: it resolves which checks to run from the files changed
since the last `v*` tag (`ops/security/scope.mjs` + `ops/security/routes.yml`).
`gitleaks` and `osv` always run; the rest are gated by which paths changed.

Flags:

| flag | effect |
|---|---|
| `--since <ref>` | scope the diff to `<ref>..HEAD` instead of the last `v*` tag |
| `--full` | ignore the diff, run every check in `routes.yml` |
| `--strict` | a missing tool fails the run (default: missing tool is logged, run continues) |
| `--no-dynamic` | skip the dynamic probe stage |
| `--no-ai` | skip the AI advisory stage |

Writes the report to `.security/report.md` (gitignored).

### Exit codes

| code | meaning |
|---|---|
| `0` | PASS |
| `1` | BLOCK — a static block-tier finding |
| `2` | usage error (unknown arg, missing `--since` value, not in a git repo) |
| `3` | FAIL — a tool was missing under `--strict` |
| `4` | scope/resolver failure (bad ref, malformed `routes.yml`, empty check set) |
| `5` | BLOCK — a dynamic probe failed (rate-limit / IDOR / authz) |

Exit `4` is **fail-closed**: if the scanner can't determine scope it refuses to
report PASS rather than silently going green on an empty scan.

Verdict order in `scan.sh`: static block (exit `1`) is checked first, then
dynamic block (exit `5`), then missing-tools-under-`--strict` (exit `3`), then
`PASS` (exit `0`). A run can have both static and dynamic block findings at
once — the report lists them all, but the exit code surfaces the static block
first.

## Tiers — what blocks, what only advises

**BLOCK** (fails the run, exit `1`):

| tool | what it blocks on |
|---|---|
| gitleaks | any secret finding (config: `.gitleaks.toml`) |
| osv-scanner | `pnpm-lock.yaml` dependency vulnerability at **High/Critical** severity |
| Semgrep | **ERROR**-severity rules only (`--severity ERROR`) |
| Trivy | `docker-compose.yml` misconfig at **CRITICAL/HIGH** |
| dynamic probes | any failing rate-limit / IDOR / authz probe (see below) — exit `5`, separate from the static tiers above |

**ADVISORY** (reported, does not block):

- Semgrep **WARNING** rules — our `api-route-without-zod-parse` and
  `kid-message-or-parent-route-missing-guard` rules in `.semgrep/gabee.yml`.
  These do not fail the gate because scan.sh passes `--severity ERROR`.
- osv-scanner findings below High/Critical (or unscored).
- Trivy misconfigs below High/Critical.
- AI review — always advisory, see below.

> The one block-tier Semgrep rule in `.semgrep/gabee.yml` today is
> `prisma-raw-string-interpolation` (ERROR).

Severity tiering for all four static tools lives in `ops/security/findings.mjs`
(`normalizeGitleaks`/`normalizeSemgrep`/`normalizeOsv`/`normalizeTrivy`), which
is what `aggregate.mjs` calls to produce the per-finding `BLOCK`/`ADVISORY` list
consumed by waivers.

Semgrep runs `.semgrep/gabee.yml` plus the `p/typescript` and `p/nextjs`
community rulesets.

## Read the report

`.security/report.md` has a header line (`# Security scan — <scope>`), one line
per tool (`clean` or the finding tier), a `MISSING tools:` line if any tool was
absent, and a final verdict:

```
RESULT: PASS      # exit 0
RESULT: BLOCK     # exit 1 — see the per-tool FINDINGS/VULN/ERROR/misconfig lines
RESULT: BLOCK (dynamic)   # exit 5 — see the dynamic probe output above the verdict
RESULT: FAIL (missing tools under --strict)   # exit 3
```

If the AI stage ran, the report also has an `## AI threat-review (advisory)`
section (see below) — it never changes the verdict line.

## Dynamic probes

After the static verdict, `scan.sh` runs a **local-only** dynamic stage
(`ops/security/dynamic/run.mjs`) that actually exercises the running app instead
of just reading source: auth brute-force / signup-abuse rate-limiting, and
cross-tenant IDOR / role-authz boundaries.

**What they test** (Playwright specs in `ops/security/dynamic/probes/`):

| spec | what it asserts |
|---|---|
| `rate-limit.spec.ts` | `POST /api/auth/login` returns `429` by the 6th bad attempt (limiter is 5/5min); `POST /api/auth/signup` returns `429` before 8 signups complete (limiter is 5/15min) |
| `idor.spec.ts` | tester A `PATCH`ing tester B's child profile is `403`/`404`, never `200`; tester A `GET`ing a real fixture message owned by tester B is `403`/`404`, not a leak |
| `authz.spec.ts` | a parent token against `GET /api/admin/users/parents` is `403`; an anonymous request to `GET /api/profiles` is `401` |

**Scope:** the dynamic stage only runs when `app-rate-limit` or `app-authz-idor`
is in the resolved check set (`routes.yml`) — e.g. a diff touching
`apps/web/src/app/api/` — or when `--full` is passed. `--no-dynamic` skips it
unconditionally. It also requires `docker`; if docker isn't available the stage
is skipped with a note, never silently treated as pass-vs-fail ambiguous (the
report says `dynamic: skipped (docker not available)`).

**Throwaway target:** `ops/security/dynamic/target.sh up` brings up an ephemeral,
isolated target and prints its `BASE_URL`; `target.sh down` tears it down
(`run.mjs` always calls `down` in a `finally`, even if the probes fail or
crash). The target is:

- a fresh Postgres 16 container (`gabee-sec-pg`) with a database that **must**
  end in `_test` (`gabee_sec_test`) — a hardcoded guard in `target.sh` refuses
  to run otherwise;
- migrated + seeded (curriculum seed + tester A/B fixtures via
  `STAGING_FIXTURES=1 ... seed-fixtures.ts`) from the **host** toolchain (the
  native Prisma/tsx binaries don't run under linux/alpine, so migrate/seed
  happen on the host against the container's host-published port, while the
  web container talks to Postgres over a dedicated `gabee-sec-net` docker
  network by container name);
- a `gabee-sec-web` container built from `apps/web/Dockerfile`, forced to
  `EMAIL_PROVIDER=noop` (also hardcoded-guarded in `target.sh` — refuses to run
  with anything else), so no real mail is ever sent.

Never points at prod, staging, or any real email provider — this is a disposable
target every time.

> **Stale-image gotcha:** `target.sh` reuses the `gabee-sec-web:latest` image if
> it already exists locally — it does **not** detect that the source changed.
> After pulling new app code, run `docker rmi gabee-sec-web:latest` to force a
> rebuild before the next scan, or the dynamic probes will silently exercise
> stale app code.

A failing probe is block-tier: `run.mjs` exits `5`, `scan.sh` propagates that as
`RESULT: BLOCK (dynamic)` / exit `5`. There is currently no waiver mechanism for
dynamic findings — they can only be fixed or the stage skipped with
`--no-dynamic` (which should be treated as "not run", not "passed").

### Opt-in safe-subset staging smoke

The IDOR and authz specs are read-only assertions (they never mutate account
state or send bulk traffic), so they can also be pointed at a real deployed
environment as a smoke check — **never** the rate-limit/signup specs, which
intentionally flood the login/signup endpoints and would trip real rate limits
or spam real infra:

```bash
SEC_BASE_URL=https://staging.gabee.app npx playwright test \
  --config ops/security/dynamic/playwright.config.ts \
  probes/idor.spec.ts probes/authz.spec.ts
```

This is not wired into `scan.sh` or CI — it's a manual, opt-in command for
spot-checking a deployed environment. It requires the same tester A/B fixtures
to already exist in that environment's database.

## AI threat-review (advisory)

The final stage (`ops/security/ai-review.mjs`, invoked from `scan.sh` unless
`--no-ai`) is a **local-only, advisory** LLM pass over the release diff, scoped
by `docs/security/threat-model.md`. It shells out to the `claude` CLI
(`claude -p <prompt> --output-format json`) with the diff since `$SINCE` (or
`HEAD~1..HEAD` if unset) and the threat model, and asks for JSON findings per
threat-model vector id.

- Requires the `claude` CLI on `PATH`; if it's missing (or errors, times out
  after 120s, or returns unparseable output) the stage prints
  `- ai-review: skipped (<reason>)` and always exits `0` — it can **never**
  fail or block the gate, in CI or locally.
- Not run in CI (no `claude` CLI there; also token cost).
- `--no-ai` skips it explicitly even when the CLI is present.
- Output lines look like `- ai-note [severity] vector: scenario` — these are
  judgment calls from the model, not verdicts. Treat them the way you'd treat a
  colleague's quick read of a diff: worth triaging, not worth trusting blindly.
  Several will be false positives or already-mitigated concerns — see
  `docs/security/first-sweep-2026-07.md` for a worked example of triaging a
  batch of these.

## CI backstop

The `security` job in `.github/workflows/release.yml` runs on every `v*` tag and
gates the deploy — `deploy.needs` includes `security`, so a block-tier finding
fails the release **before** the SSH deploy step runs. It runs the same
deterministic scanners at the same tiers (gitleaks-action, osv-scanner-action,
Semgrep CLI `--severity ERROR`, Trivy `config` CRITICAL/HIGH). AI review and
dynamic probes are **local-only** and intentionally not in this job — dynamic
probes need Docker + a live throwaway target (no ephemeral DB/target
infrastructure in the CI runner), and AI review needs the `claude` CLI and
costs real tokens per run.

## Waive a block-tier finding

Per-finding fingerprint→waiver application is **fully wired**: `aggregate.mjs`
normalizes every static tool's raw JSON into per-finding records
(`ops/security/findings.mjs`), then `applyWaivers` (`ops/security/waivers.mjs`)
matches each block-tier finding's `fingerprint` against `security-waivers.yml`
before the verdict is computed. A block finding is suppressed **only** by an
entry that is fully accountable (`isAccountableWaiver`). All four fields are
required — a waiver missing any is ignored and the finding stays blocked:

```yaml
waivers:
  - fingerprint: "gitleaks:apps/web/foo.ts:generic-api-key:42"
    reason: "False positive — example string in a comment."
    approver: "valentine"
    expires: "2026-09-01"   # ISO date, must be in the future
```

An expired `expires` re-blocks the finding automatically. No secrets in this file.

### Fingerprint formats

Each tool's normalizer builds a stable fingerprint (no timestamps or absolute
paths, so a waiver survives until the underlying code actually changes):

| tool | format | example |
|---|---|---|
| gitleaks | `gitleaks:<file>:<rule>:<line>` | `gitleaks:apps/web/foo.ts:generic-api-key:42` |
| semgrep | `semgrep:<check_id>:<file>:<line>` | `semgrep:semgrep.prisma-raw-string-interpolation:apps/web/src/lib/db.ts:88` |
| osv | `osv:<package>@<version>:<vuln_id>` | `osv:hono@4.12.23:GHSA-88fw-hqm2-52qc` |
| trivy | `trivy:<target>:<check_id>:<line>` | `trivy:docker-compose.yml:AVD-DS-0026:40` |

Two things bite people hand-writing these, so copy the fingerprint from the scan
report rather than composing it yourself:
- **semgrep prefixes the `check_id` with its config directory.** A rule declared
  as `prisma-raw-string-interpolation` in `.semgrep/gabee.yml` is emitted as
  `semgrep.prisma-raw-string-interpolation` — so the fingerprint carries
  `semgrep:` twice (tool prefix + check_id prefix). That is correct, not a typo.
- **osv pins the resolved version and trivy pins the line, deliberately.** Waivers
  for a CVE are almost always reachability claims ("dev-only transitive dep"); a
  version bump can invalidate that reasoning, so the bump forces re-review instead
  of silently inheriting the old waiver. Likewise two services in one compose file
  can trip the same trivy check — the line keeps them separately waivable.

Only block-tier findings are matched against waivers — advisory findings are
never suppressed (there's nothing to suppress; they don't fail the run). The
dynamic stage has no fingerprints/waivers of its own — see "Dynamic probes"
above.

## Install the tools locally

```bash
brew install gitleaks trivy osv-scanner
pipx install semgrep        # or: pip install semgrep (may hit PEP 668 on newer OSes)
```

osv-scanner can also be installed from its GitHub release binary. A missing tool
is logged in the report; under `--strict` it fails the run (exit `3`).

## Design decision — a revoked device's unsynced work is forfeit (2026-07-16)

`requireKidDevice` rejects a revoked device's token, so anything it submits after
revocation (events, progress sync) is refused. **This is deliberate. Do not "fix" it
by accepting late syncs.**

The tempting case: a kid plays offline Monday, the tablet is lost Tuesday, the parent
revokes, and on Friday the device finds internet and tries to sync Monday's genuine
sessions. Shouldn't we take them?

No — because **we cannot verify that Monday's data is Monday's data**. The device
controls both the payload and the timestamps (`client_ts`, `updated_at`), and the
server never witnessed Monday. So "accept only the legitimate Monday sessions" is not
an option that exists. The only real choices are:
  - accept whatever the lost device sends (including fabrications) — revocation
    becomes void for writes, and a stolen tablet keeps writing until TTL; or
  - accept nothing — the genuine work is lost along with the fabrications.

"Quarantine for parent review" is not a middle ground either: the parent can't
distinguish a genuine payload from a tampered one, and a competent thief submits the
real sessions *plus* inflated stars. It moves an unanswerable question to someone with
no better evidence.

**Recovery path (device comes back):** re-pair it. `sync.ts`'s flush keeps the queue on
ANY failure including 401 (`sync.ts` "the queues are kept… nothing is lost"), and
`clearAuth` (`store.ts`) drops the token but never touches the IndexedDB queues — so a
re-paired device drains its backlog and the offline work lands. `total_stars` is merged
monotonically (`Math.max`), so a late-arriving snapshot can't clobber newer progress.
The parent is the trust anchor, which is right: only they know whether the tablet came
back or is gone.

**Blast radius when it's never recovered:** only work that never found connectivity
before the device went missing — the sync manager drains on `online`,
`visibilitychange`, `pagehide`, and a periodic timer, so anything that had internet is
already on the server.
