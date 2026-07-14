# Security review framework — design

**Date:** 2026-07-14
**Branch:** `ops/security-review-framework`
**Status:** approved design → implementation plan next

## Problem
Releases go straight from a `v*` tag to prod via CD, with no security gate. Security
so far has been ad-hoc — issues surface only when a reviewer happens to notice them
(e.g. the staging `env_file` and `api.*` basic-auth/CORS Criticals were caught by a
one-off integration review, not a process). There is no documented threat model, no
repeatable pre-release check, and no automated abuse/injection/secret scanning. As the
app handles children's PII and now captures real IP/device metadata (with a pending
privacy gate), that gap is a liability.

## Goal
A **security review framework**: a durable threat-vector taxonomy plus a repeatable,
mostly-automated process that runs before every prod release — **diff-scoped** by
default to conserve effort — and can be run in full on demand. It spans static,
dynamic/behavioral, and AI-judgment checks across network, platform, and application
layers, with a tiered gate that hard-blocks high-confidence findings and reports the
rest.

## Settled decisions
- **Engine: hybrid** — deterministic tools + a bespoke dynamic-probe suite + an AI
  threat-review.
- **Gate: tiered** — high-confidence deterministic findings (leaked secret, Critical/
  High CVE, SAST error-level, a failing authz/IDOR probe) **hard-block** the release
  (waivable with a logged reason); AI/judgment findings are **advisory** (reported for
  triage).
- **Location: both** — a local `security:scan` command the operator runs before
  tagging (tools + dynamic + AI, diff-scoped), plus a **CI backstop** job in
  `release.yml` that re-runs the deterministic tools on the tag and hard-blocks deploy.
- **v1 scope: everything** — all three engine layers, the taxonomy, tiered gate +
  waivers, both run locations, the on-demand full sweep, and the human-judgment
  checklist.
- **Tool set (all free/OSS, no SaaS):** Semgrep (SAST), gitleaks (secrets),
  osv-scanner + `pnpm audit` (deps), Trivy (image/IaC), bespoke Playwright/fetch
  probes (dynamic), Claude via the existing agent workflow (AI review). ZAP and CodeQL
  are documented **future add-ons**, not v1.

## Terminology (three run types)
- **Per-release scan** — auto-triggered (CI backstop gate) + operator runs locally
  before tagging. Diff-scoped. Tool-executed.
- **Full sweep** (`security:scan --full`) — *manually triggered* on a cadence; whole
  codebase, not diff-scoped. **Still fully tool-executed** (same engine, broader
  scope). "Manual" = human-triggered, NOT human-performed.
- **Human-judgment checklist** — the small residue that genuinely needs a human:
  privacy/policy review of device-metadata retention, novel exploratory abuse hunting
  beyond the scripted probes, and keeping the threat-model doc current.

## Non-goals (v1)
- Not a full pentest / red-team engagement (the human-judgment checklist points at
  where that would go).
- No paid SaaS security platforms.
- ZAP active scanning and CodeQL: documented as add-ons, not built now.
- Does not itself *fix* findings or add app rate-limiting — it *surfaces* gaps (the
  first full sweep is expected to flag real ones, e.g. missing rate limits).

## Architecture

### 1. Two artifacts
1. **Threat model** (`docs/security/threat-model.md`) — the durable taxonomy (§2).
2. **Runnable process** — `ops/security/scan.sh` (exposed as `pnpm security:scan`) +
   the CI backstop, executing checks against the taxonomy (§3–§6).

### 2. Threat taxonomy — by layer, mapped to Gabee's real surfaces
Each vector records: **surface** (where it lives), **check(s)** (which engine layer +
tool covers it), **tier** (hard-block vs advisory), and **backing** (OWASP Top-10 /
ASVS / STRIDE reference). Structured in three layers:

- **Network** — TLS/cert correctness (Traefik LE TLS-ALPN); Cloudflare grey-cloud
  exposure; **CORS scope** (`apps/web/src/lib/server/cors.ts` — single-origin, no
  credentials); host isolation (apex/parents/admin/api/kid routers, incl. the
  un-gated staging `api.*`); edge rate-limiting; open-port surface.
- **Platform / infra** — CD & secrets (`release.yml`, GHCR token, VPS SSH key);
  docker-compose / Traefik misconfig (basic-auth scope, network exposure); container
  base-image CVEs; `.env` handling (secrets never tracked; `.env.*.example`
  placeholders); R2 backup credential scope; Mailgun send-abuse; backup/restore
  integrity.
- **Application** — authn (scrypt+JWT, session cookies, `emailConfirmedAt` gating);
  authz (parent vs admin isolation, `requireParent`/admin gates, **IDOR/object-authz**
  on kid profiles/messages/devices); injection (SQL via Prisma raw, XSS, SSRF, path
  traversal); input validation (Zod coverage on API bodies/params); **rate-limiting**
  (signup/login/password-reset/email/AI/content endpoints); secrets-in-code;
  **PII/data-exposure** (device-metadata + IP retention, the pending privacy gate,
  admin-only IP access); supply-chain (pnpm deps + lockfile integrity).

The taxonomy doc is the source of truth the AI review reasons against and the routing
table (§4) maps to.

### 3. Engine — three layers
- **Static** (code, no running target):
  - **Semgrep** — rulesets `p/typescript`, `p/react`, `p/nextjs`, `p/owasp-top-ten`,
    `p/secrets`, plus a small repo-local `.semgrep/` ruleset for Gabee idioms (e.g.
    "API route handler without a Zod parse", "raw `$queryRaw` with interpolation",
    "missing `requireParent`/admin guard").
  - **gitleaks** — secrets in diff + history; `.gitleaks.toml` allowlists
    `.env.*.example` placeholders.
  - **osv-scanner** (primary) + `pnpm audit` (secondary) — deps/CVEs from
    `pnpm-lock.yaml`.
  - **Trivy** — CVEs in the built `gabee-web/kid/backup` images + Dockerfile/compose
    misconfig.
- **Dynamic / behavioral (DAST-lite)** — bespoke Playwright + fetch probes under
  `ops/security/dynamic/`. **Primary target = an ephemeral throwaway** spun up at scan
  time (`docker compose` with `EMAIL_PROVIDER=noop`, a fresh DB + synthetic fixtures,
  torn down after — the e2e recipe). This gives full isolation: no real emails, no
  pollution of the shared staging env, and no rate-limiter state leaking to real
  testers. The persistent **staging env is NOT the default DAST target** — it uses
  real Mailgun (the flooding probe would send real mail) and is shared with human
  testers. An **opt-in "safe subset"** (IDOR / authz-boundary / read-only rate-limit
  assertions — nothing that emails or mutates shared data) MAY smoke-run against the
  deployed staging release-candidate when you want to probe the actual artifact.
  Probes:
  - **auth rate-limit / brute-force**: N logins → assert lockout / `429`.
  - **signup abuse**: N signups → assert the limiter returns `429` **before** any
    send; the target runs with `EMAIL_PROVIDER=noop` so no real email is ever sent.
  - **IDOR / object-authz**: auth as fixture-tester A, attempt to read/mutate tester
    B's kids / messages / devices → assert `403/404`.
  - **authz boundaries**: parent token on admin routes → assert denied; unauthenticated
    on gated routes → assert `401`.
  Safety rule: dynamic probes NEVER run against prod and NEVER against a real email/
  payment provider — target must have providers set to `noop`/mock.
- **AI threat-review** — a structured agent (the existing Claude agent/workflow) reads
  the release diff + `threat-model.md` and reasons per-vector on the judgment-heavy
  items (authz logic, abuse chains, rate-limit gaps, business logic), emitting findings
  with severity + a concrete failure scenario. Local only (controlled token cost).

### 4. Diff-scoping — the energy saver
`security:scan --since <ref>` (default `<ref>` = last `v*` tag):
1. `git diff --name-only <ref>..HEAD` → changed paths.
2. A **routing table** (`ops/security/routes.yml`) maps path globs → vectors/checks:
   - `apps/web/src/app/api/**` → injection, authz/IDOR, rate-limit, input-validation
     (Semgrep API rules + the matching dynamic probes + AI review of those routes).
   - `apps/web/src/lib/server/{auth,cors,http,env}*` → authn/session, CORS, secrets.
   - `packages/db/prisma/**` → data-exposure, migration safety, PII columns.
   - `docker-compose*.yml`, `deploy/**`, `.github/workflows/**`, `ops/**` →
     platform/network/CD/secrets/IaC (Trivy config + gitleaks + AI infra review).
   - `**/package.json`, `pnpm-lock.yaml` → deps/supply-chain (osv + audit).
3. Run **only** the mapped checks (static rules filtered to changed files where the
   tool supports it; dynamic probes selected by touched surface) + the diff-scoped AI
   review. Secrets + dep scans always run (cheap, and a leaked secret anywhere matters).
`--full` ignores the routing table and runs the entire taxonomy over the whole tree.

### 5. Tiered gate + waivers
- **Hard-block (exit non-zero):** gitleaks hit; osv/Trivy Critical or High CVE;
  Semgrep `ERROR` severity; a failing dynamic authz/IDOR/rate-limit probe.
- **Advisory (report, exit zero):** Semgrep `WARNING`/`INFO`; AI-judgment findings;
  dynamic findings on non-security-critical assertions.
- **Waivers** (`security-waivers.yml`): a hard-block finding can be waived with
  `{ id/fingerprint, reason, approver, expires }`. `security:scan` and the CI backstop
  both honor unexpired waivers; expired waivers re-block. Every scan writes a report to
  `.security/report-<ref>.md` (git-ignored) + prints a summary.

### 6. Run locations
- **Local pre-tag:** `pnpm security:scan` → full three-layer, diff-scoped, tiered
  report; operator runs before cutting a release. `--full` for the sweep.
- **CI backstop:** a `security` job in `release.yml`, `needs`-gated before `deploy`,
  running the **deterministic** tools (Semgrep, gitleaks, osv, Trivy) diff-scoped
  against the previous tag, honoring waivers, hard-blocking deploy on the block tier.
  No AI, no live target in CI (dynamic + AI stay local) — keeps CI cheap and
  secret-free. **Consequence:** CI enforces only the *static* block-tier (secrets/
  CVE/SAST-error); the *dynamic* block-tier (failing authz/IDOR/rate-limit probe) is
  enforced by the operator's local `security:scan` before tagging. The local run is
  the complete gate; CI is the deterministic safety net for a forgotten local run.

### 7. Human-judgment checklist
`docs/security/review-checklist.md` — the by-hand residue, with a cadence: device-
metadata **privacy/retention/policy** review (ties to the pending privacy gate),
exploratory abuse hunting beyond the scripted probes, dependency-license/health
review, and threat-model maintenance (add a vector whenever a new surface ships).

## Testing / acceptance
- `security:scan --since <ref>` on a diff that touches an API route runs Semgrep API
  rules + the IDOR/rate-limit probes + a scoped AI review, and nothing unrelated.
- A planted secret in the diff → gitleaks hard-blocks (non-zero exit); adding a waiver
  for it → passes; expiring the waiver → blocks again.
- A known-vulnerable dep pinned in a scratch branch → osv/Trivy hard-block.
- A dynamic IDOR probe against a target where tester A *can* read tester B's kid →
  fails the scan (proves the probe works); against the real app → passes.
- The CI backstop fails a release tag containing a planted secret; passes a clean tag.
- `--full` runs the entire taxonomy; the first real run is expected to surface genuine
  gaps (e.g. any endpoint lacking rate-limiting) as findings to triage.
- Prod/CD unaffected structurally: the `security` job only gates `deploy`; a clean scan
  changes nothing about the existing pipeline.

## Rollout (phased inside v1)
1. Threat-model doc + routing table + tool configs (`.semgrep/`, `.gitleaks.toml`).
2. `scan.sh` static layer + tiered gate + waivers + `pnpm security:scan`.
3. Dynamic probe suite (`ops/security/dynamic/`) against an ephemeral throwaway target
   (noop email, fresh DB + fixtures); optional safe-subset mode for a staging smoke.
4. AI threat-review step (diff-scoped).
5. CI backstop job in `release.yml`.
6. Human-judgment checklist + first full sweep (triage the gaps it finds).

## File inventory
- Create: `docs/security/threat-model.md`, `docs/security/review-process.md`
  (runbook), `docs/security/review-checklist.md`.
- Create: `ops/security/scan.sh`, `ops/security/routes.yml`,
  `ops/security/dynamic/*` (probe suite), `.semgrep/` (repo rules), `.gitleaks.toml`,
  `security-waivers.yml`.
- Modify: root `package.json` (`security:scan` script), `.github/workflows/release.yml`
  (add the `security` backstop job gating `deploy`), `.gitignore` (`.security/`).
