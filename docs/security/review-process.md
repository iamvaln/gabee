# Security review runbook

How to run the static security gate, read its report, and waive a finding. This
is the **static deterministic core** (Plan 1). Dynamic probes, AI threat-review,
the first full-repo sweep, and per-finding fingerprint→waiver application land in
**Plan 2** — see the caveats below.

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

Writes the report to `.security/report.md` (gitignored).

### Exit codes

| code | meaning |
|---|---|
| `0` | PASS |
| `1` | BLOCK — a block-tier finding |
| `2` | usage error (unknown arg, missing `--since` value, not in a git repo) |
| `3` | FAIL — a tool was missing under `--strict` |
| `4` | scope/resolver failure (bad ref, malformed `routes.yml`, empty check set) |

Exit `4` is **fail-closed**: if the scanner can't determine scope it refuses to
report PASS rather than silently going green on an empty scan.

## Tiers — what blocks, what only advises

**BLOCK** (fails the run, exit `1`):

| tool | what it blocks on |
|---|---|
| gitleaks | any secret finding (config: `.gitleaks.toml`) |
| osv-scanner | any `pnpm-lock.yaml` dependency vulnerability |
| Semgrep | **ERROR**-severity rules only (`--severity ERROR`) |
| Trivy | `docker-compose.yml` misconfig at **CRITICAL/HIGH** |

**ADVISORY** (reported, does not block):

- Semgrep **WARNING** rules — our `api-route-without-zod-parse` and
  `kid-message-or-parent-route-missing-guard` rules in `.semgrep/gabee.yml`.
  These do not fail the gate because scan.sh passes `--severity ERROR`.
- AI review — Plan 2.

> The one block-tier Semgrep rule in `.semgrep/gabee.yml` today is
> `prisma-raw-string-interpolation` (ERROR). gitleaks and osv currently block on
> *any* finding; per-severity gating for osv (block on High+ only) is a Plan 2
> refinement that needs per-finding JSON.

Semgrep runs `.semgrep/gabee.yml` plus the `p/typescript` and `p/nextjs`
community rulesets.

## Read the report

`.security/report.md` has a header line (`# Security scan — <scope>`), one line
per tool (`clean` or the finding tier), a `MISSING tools:` line if any tool was
absent, and a final verdict:

```
RESULT: PASS      # exit 0
RESULT: BLOCK     # exit 1 — see the per-tool FINDINGS/VULN/ERROR/misconfig lines
RESULT: FAIL (missing tools under --strict)   # exit 3
```

## CI backstop

The `security` job in `.github/workflows/release.yml` runs on every `v*` tag and
gates the deploy — `deploy.needs` includes `security`, so a block-tier finding
fails the release **before** the SSH deploy step runs. It runs the same
deterministic scanners at the same tiers (gitleaks-action, osv-scanner-action,
Semgrep CLI `--severity ERROR`, Trivy `config` CRITICAL/HIGH). AI review and
dynamic probes are not in this job (Plan 2).

## Waive a block-tier finding

A block finding is suppressed **only** by an entry in `security-waivers.yml` that
is fully accountable (see `isAccountableWaiver` in `ops/security/waivers.mjs`).
All four fields are required — a waiver missing any is ignored and the finding
stays blocked:

```yaml
waivers:
  - fingerprint: "gitleaks:apps/web/foo.ts:generic-api-key:42"
    reason: "False positive — example string in a comment."
    approver: "valentine"
    expires: "2026-09-01"   # ISO date, must be in the future
```

An expired `expires` re-blocks the finding automatically. No secrets in this file.

> **Caveat (Plan 2):** per-finding fingerprint→waiver application is not yet
> wired into the gate. Today `scan.sh` reports pass/fail per tool; the waiver
> helper (`waivers.mjs`) is unit-tested but only applied inside the gate once the
> tools emit per-finding JSON in Plan 2.

## Install the tools locally

```bash
brew install gitleaks trivy osv-scanner
pipx install semgrep        # or: pip install semgrep (may hit PEP 668 on newer OSes)
```

osv-scanner can also be installed from its GitHub release binary. A missing tool
is logged in the report; under `--strict` it fails the run (exit `3`).
