# First full security sweep — 2026-07

The first end-to-end run of the complete gate (static + dynamic + AI) against
the whole repo, on `ops/security-dynamic-ai` at commit `dbd7d31`. This is a
**triage catalog**, not a cleanup — every finding below gets a *proposed*
disposition; nothing here is auto-fixed, and no waiver has been added to
`security-waivers.yml` (that requires a human `approver` — see
[`docs/security/review-process.md`](./review-process.md#waive-a-block-tier-finding)).

## Run summary

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$HOME/Library/Python/3.12/bin:$PATH"
pnpm security:scan --full 2>&1 | tee .security/first-sweep.log; echo "exit=$?"
```

- **Scope:** FULL (every check in `routes.yml`, not diff-scoped).
- **Result:** `RESULT: BLOCK` — **exit 1** (static block-tier). The logged
  `exit=0` in the terminal is an artifact of the exact command from the task
  brief: `echo "exit=$?"` after a `| tee` pipe captures `tee`'s exit code, not
  `pnpm`'s. The real exit code is confirmed **1** from pnpm's own
  `ELIFECYCLE Command failed with exit code 1` line in the log.
- **Tools:** gitleaks 8.30.1, trivy 0.72.0, osv-scanner 2.4.0, semgrep 1.169.0
  — all present, nothing under `MISSING tools:`.
- **Static:** 2 blocking, 0 waived, 108 advisory (99 semgrep + 9 osv).
- **Dynamic:** see [Dynamic probes](#dynamic-probes) — the first run hit a
  Docker/network infra failure unrelated to app security; a clean rerun passed
  6/6.
- **AI review:** 6 advisory notes (see [AI advisory notes](#ai-advisory-notes-judgment-not-verdicts)).
- **Containers:** none leaked. `docker ps -a` / `docker network ls` show no
  `gabee-sec-*` resources after either run (verified below).

```
$ docker ps -a --format '{{.Names}}' | grep gabee-sec || echo "clean"
clean
$ docker network ls | grep gabee-sec || echo "clean"
clean
```

One operational note from running this sweep: `target.sh` was forced to
rebuild `gabee-sec-web:latest` (via `docker rmi`) per the stale-image gotcha
in the runbook, since the cached image predated `HEAD` by about an hour. That
rebuild hit a **transient Docker Desktop → registry-1.docker.io routing
failure** (`no route to host` resolving `docker/dockerfile:1`), which made
`target.sh up` fail and `run.mjs` report a dynamic block. Confirmed transient:
`docker pull hello-world` and a re-run of the dynamic stage moments later both
succeeded cleanly. Recorded here, not as a framework bug — the framework did
the right fail-closed thing (block rather than silently skip).

---

## Static findings — BLOCK tier

| fingerprint | tool | tier | what it is | proposed disposition |
|---|---|---|---|---|
| `osv:hono@4.12.23:GHSA-88fw-hqm2-52qc` | osv-scanner | BLOCK (HIGH) | `hono@4.12.23` CORS middleware reflects any `Origin` with `Access-Control-Allow-Credentials: true` when `origin` is left at its wildcard default. | **waive** — see reasoning below |
| `osv:vite@7.3.3:GHSA-fx2h-pf6j-xcff` | osv-scanner | BLOCK (HIGH) | `vite@7.3.3` `server.fs.deny` bypass, **Windows-only**, dev-server-only. | **waive** — see reasoning below |

**Reasoning (both):** neither package reaches the deployed runtime.

- `hono` + `@hono/node-server` arrive transitively via `prisma@7.8.0` →
  `@prisma/dev@0.24.3` (Prisma 7 bundles a local pglite dev server for
  `prisma dev`, which Gabee does not use — no `prisma dev` invocation
  anywhere in the repo). `prisma` is a **devDependency** of `packages/db`
  (`packages/db/package.json`); the production image only installs
  `@prisma/client` + `@prisma/adapter-pg` (regular `dependencies`). The CLI,
  and therefore hono, is not present in the `apps/web` runtime container.
- `vite` is a **devDependency** of `apps/kid` (`apps/kid/package.json`), used
  only by `vite build`/`vite dev`; the built kid PWA is static output served
  by nginx (`apps/kid/Dockerfile`) — vite itself never ships. The specific
  HIGH CVE is additionally Windows-only and dev-server-only, and Gabee's
  build/deploy hosts are Linux (VPS) / macOS (dev), never Windows.

**Proposed waiver entries** (for the user to add with a real `approver`):

```yaml
  - fingerprint: "osv:hono@4.12.23:GHSA-88fw-hqm2-52qc"
    reason: "hono/@hono/node-server arrive only via prisma's bundled @prisma/dev (prisma CLI is a devDependency, prisma dev is never invoked); never present in the apps/web production image."
    approver: "<user>"
    expires: "2026-10-01"
  - fingerprint: "osv:vite@7.3.3:GHSA-fx2h-pf6j-xcff"
    reason: "vite is a devDependency of apps/kid (build tool only, static output ships); CVE is Windows-only and dev-server-only, and Gabee never builds/deploys on Windows."
    approver: "<user>"
    expires: "2026-10-01"
```

**Also backlog:** even though these are safe to waive on reachability
grounds, bump `prisma` (fixes `hono`/`@hono/node-server`/`esbuild`
transitively) and `vite`/`postcss` in a routine dependency-update pass — the
waiver should not become a substitute for eventually updating. No urgency
(pinned to a 2026-10-01 expiry above), no threat-model vector escalation
needed (`app-supply-chain`, T2, already tracked).

---

## Static findings — advisory tier, by tool

### Semgrep (99 advisory findings)

#### `kid-message-or-parent-route-missing-guard` — 79 hits — **broken rule, high-confidence false-positive generator**

The rule (`.semgrep/gabee.yml:84-105`) is meant to flag a `route(...)` handler
with no `requireParent`/`requireAdmin`/`requireSuperAdmin` guard. Its
`pattern-not-inside: requireAdmin(...)` (and the two siblings) checks whether
the *matched `route(...)` call* is nested inside a `requireAdmin(...)` call —
but in every real Gabee route, the guard is called as a **statement inside**
the `route(...)` callback body (e.g. `apps/web/src/app/api/admin/audit/route.ts:11`:
`export const GET = route(async (req) => { await requireAdmin(req); ... })`).
That's the opposite nesting relationship from what `pattern-not-inside`
checks, so the rule fires regardless of whether a guard is present.

**Verified systemic, not cherry-picked:** 80 `route.ts` files exist under
`apps/web/src/app/api/`; 68 of them call
`requireParent(`/`requireAdmin(`/`requireSuperAdmin(` somewhere in the file
(`grep -l`). Spot-checked three flagged files
(`api/admin/audit/route.ts`, `api/messages/route.ts`,
`api/profiles/[id]/route.ts`) — all three call the correct guard as their
first statement and are still flagged.

- **Disposition: fix** — `.semgrep/gabee.yml`, rule `kid-message-or-parent-route-missing-guard`
  (lines 84-105). Replace the inverted `pattern-not-inside` with a check that
  the guard call is *inside* the route callback, e.g. restructure as
  `pattern-inside: route($$$ARGS) { ... }` combined with
  `pattern-not: ... requireParent($REQ) ...` / a `metavariable-pattern`
  requiring the callback body to contain a guard call, or (simpler) flip the
  match to anchor on the callback body itself:
  `patterns: [pattern: route(async ($REQ) => { $$$BODY }), pattern-not: route(async ($REQ) => { ...; requireParent($REQ); ...; })]`
  and the `$CTX`-variant sibling. Needs a semgrep-side fix + a regression
  check that it still fires on a genuinely unguarded route (there may not be
  one in the current tree to test against — consider a `semgrep --test`
  fixture).
- Until fixed, this rule provides **no real signal** — it's WARNING-tier
  (doesn't block per `docs/security/review-process.md`), but it's also
  useless in its current form. The AI review's own note (below) points out
  the T1 `app-authz-idor` vector's only real enforcement is the proxy tests,
  which is now doubly true since this Semgrep guard doesn't work either.

#### `javascript.browser.security.wildcard-postmessage-configuration` — 18 hits — **docs-only, not shipped**

All 18 hits are in `docs/Admin/Gabee/*.jsx`, `docs/Gabee-handoff/gabee/project/*.jsx`,
and `docs/UpdatesParentsAdmin:Landing/handoff-unzipped/gabee/project/*.jsx` —
Claude-Design handoff prototype files (per project memory:
`docs/Gabee-handoff/` is the milestone-4 visual-design source, not app code).
None of these paths are imported by `apps/web` or `apps/kid`.

- **Disposition: backlog** — no action needed for shipped security (these
  files never run). If/when this prototype code is ported into `apps/kid` or
  `apps/web`, re-run the scan then — it'll catch it. Consider adding these
  handoff/prototype doc directories to a semgrep `paths.exclude` so they stop
  generating noise in every future sweep (lower-priority hygiene, not a
  security backlog item — threat-model vector: none, informational only).

#### `typescript.react.security.audit.react-dangerouslysetinnerhtml` — 2 hits — **docs-only, not shipped**

Same handoff-prototype files (`design-canvas.jsx`/`parent-home.jsx`/`parent-kids.jsx`
under `docs/Gabee-handoff/` and `docs/UpdatesParentsAdmin:Landing/`).

- **Disposition: backlog** — same reasoning as above; not shipped code.

### osv-scanner (9 advisory findings)

| package@version | id | severity | reachability |
|---|---|---|---|
| `@hono/node-server@1.19.11` | GHSA-92pp-h63x-v22m | MODERATE | transitive via `prisma`'s `@prisma/dev` — devDependency only, see BLOCK-tier reasoning above |
| `esbuild@0.27.7` / `esbuild@0.28.0` | GHSA-g7r4-m6w7-qqqr | LOW (×2) | build tool, dev-server file-read bug, Windows-only |
| `hono@4.12.23` | GHSA-j6c9-x7qj-28xf, GHSA-rv63-4mwf-qqc2, GHSA-wgpf-jwqj-8h8p, GHSA-wwfh-h76j-fc44 | MODERATE (×4) | same transitive `@prisma/dev` path as the BLOCK-tier hono finding |
| `postcss@8.4.31` | GHSA-qx2v-qp2m-jg93 | MODERATE | CSS build-time processing (Tailwind toolchain) — XSS in stringified output only matters if untrusted CSS is processed at runtime, which Gabee doesn't do |
| `vite@7.3.3` | GHSA-v6wh-96g9-6wx3 | MODERATE | `launch-editor` NTLMv2 hash disclosure via UNC path, Windows-only, dev-only |

- **Disposition: backlog** — same non-reachability reasoning as the BLOCK-tier
  pair; these are advisory already (don't block), no waiver needed. Bundle
  into the same routine dependency-bump pass as the BLOCK-tier items
  (`app-supply-chain`, T2).

### gitleaks — clean

0 findings (`.security/raw/gitleaks.json` is `[]`). Full-history scoped by
`--full` (no `--log-opts` restriction).

### Trivy — clean (but narrow scope, see AI note)

0 misconfigurations against `docker-compose.yml`. Note: both `scan.sh` and the
CI job only scan `docker-compose.yml` — `deploy/proxy/docker-compose.yml` and
`docker-compose.staging.yml` are not scanned by either. See the matching AI
advisory note below; tracked as backlog, not fixed here.

---

## Dynamic probes

**First `--full` run:** `target.sh up` failed while rebuilding
`gabee-sec-web:latest` (forced via `docker rmi` before the run, per the
stale-image gotcha — the cached image predated `HEAD` by ~1 hour). Failure was
`docker/dockerfile:1` frontend image resolution hitting
`no route to host` against `registry-1.docker.io` — a local Docker Desktop
networking blip, not an application or scanner finding. `run.mjs`'s `finally`
correctly ran `target.sh down`; no leaked containers from that attempt either.

**Rerun** (`SEC_CHECKS='app-authz-idor\napp-rate-limit' node ops/security/dynamic/run.mjs --full`,
after confirming registry connectivity was restored): clean build, clean
migrate + seed (`fixtures OK — parents=2 kids=3 messages=1`), all 6 probes
passed:

```
[1/6] authz.spec.ts › parent token is rejected from admin API (403)          ✓
[2/6] authz.spec.ts › unauthenticated request to a gated route is 401        ✓
[3/6] idor.spec.ts  › cross-family profile IDOR is denied                    ✓
[4/6] idor.spec.ts  › cross-family message read is denied                    ✓
[5/6] rate-limit.spec.ts › auth brute-force is rate-limited (429 by 6th)     ✓
[6/6] rate-limit.spec.ts › signup abuse is rate-limited (429 before window)  ✓
  6 passed (2.1s)
```

- **Disposition: no action.** The app's rate-limiting, IDOR, and authz
  controls are working as designed against the throwaway target. Containers
  and the `gabee-sec-net` network were torn down cleanly after the rerun too.
- The infra flake itself doesn't need a code fix, but it's worth knowing:
  **if the dynamic stage ever reports a block right after a forced
  `docker rmi` + rebuild, check for a registry/network failure in the build
  log before assuming it's a real app regression** — the report text
  (`- dynamic: PROBE FAILURE (block)`) doesn't currently distinguish "the
  Playwright specs ran and a probe failed" from "the target never came up."
  Possible future improvement (not done here — would be app/framework code):
  have `run.mjs` surface a distinct exit path or message when
  `target.sh up` itself fails (build/migrate/seed) vs. when Playwright
  actually runs and a spec fails.

---

## AI advisory notes — judgment, not verdicts

Six notes from `ops/security/ai-review.mjs` against the diff since the last
`v*` tag (`v2.9.1..HEAD`). Each verified against the actual code (not taken at
face value) — verdicts and dispositions below are mine, not the model's.

| # | vector | sev | note | verified? | proposed disposition |
|---|---|---|---|---|---|
| 1 | `plat-env-handling` | med | `.gitleaks.toml`'s `paths` allowlist (`'''\.env\.[a-z]+\.example$'''`) exempts every tracked `.env*.example` file from scanning entirely (path-level), rather than allowlisting the specific placeholder *values* inside them — so a real secret accidentally pasted into `.env.production.example` would be invisible to gitleaks. | **Confirmed** — read `.gitleaks.toml:8-10`; it's a `paths` array, which gitleaks treats as "skip this file," not a value-pattern match. | **backlog** — tighten `.gitleaks.toml` to allowlist specific placeholder value patterns (e.g. `CHANGE_ME`, `example.com`) instead of exempting the whole file. Low urgency (these files are also human-reviewed on every PR touching them), but it is a real gap in the `plat-env-handling` control's stated purpose. Threat-model vector: `plat-env-handling`, T1 — worth prioritizing over the other backlog items given its T1 rating. |
| 2 | `app-secrets-in-code` | med | The `'''staging-pass'''` regex in the same allowlist is an unanchored substring match, applied repo-wide (not scoped to fixture files) and across full history — any future secret whose value happens to contain the substring `staging-pass` would be silently allowlisted everywhere, not just in the fixture it was written for. | **Confirmed** — `.gitleaks.toml:13`, no path scoping on the `regexes` list (gitleaks applies `regexes` allowlist entries globally, not just within `paths`). | **backlog** — scope this regex tighter (anchor it to the actual fixture string, e.g. wrap with a longer literal from `seed-fixtures.ts`, or move it under a path-scoped allowlist rule if gitleaks config supports per-rule path+regex combination). Threat-model vector: `app-secrets-in-code`, T1. |
| 3 | `app-authz-idor` | med | `apps/kid/src/lib/api.ts:164` adds `api.updateProfile()`, which lets the kid PWA (device-token surface) `PATCH /api/profiles/:id` with an arbitrary `UpdateProfileRequest` body — the AI's concern: a compromised/paired device could rewrite any parent-controlled profile field, or probe other `profileId`s cross-family. | **Partially confirmed, more nuanced than stated.** Traced the auth chain: `requireParent` (`http.ts:60`) accepts any valid session JWT (`SessionClaims = { parentId, email }`) via cookie or `Authorization: Bearer`; there's no separate "device" claim type — a paired kid device's token *is* a full parent-equivalent session (minted by `/api/pair/claim`/`/api/pair/claim-code`), by existing design, not something this diff introduced. The service function `updateProfile(parentId, id, input)` (`services/profiles.ts:136-159`) *does* enforce `findFirst({ id, parentId })` ownership — so the "probe other profileIds cross-family" half of the AI's scenario is **not** correct; that's blocked, and the dynamic IDOR probe (test #3 above) actively re-confirms it. What **is** real: `UpdateProfileRequestSchema` accepts `name`, `birth_date`, `gender`, `language`, etc. — not just the `audio_enabled` field the kid client's comment says it's for (`"Best-effort persistence for kid-side profile settings (audio toggle...)"`). A compromised/rooted kid device already holding a valid paired session could rewrite any of its *own* family's profile fields via this endpoint, not just the intended one. | **backlog** — add a kid-scoped field allowlist (e.g. reject `PATCH /api/profiles/:id` requests missing `requireParent`'s parent-browser-session distinction, or add a narrower endpoint/schema for the device-audio-toggle use case). This is a least-privilege gap in an existing design (device≈parent auth), not a new cross-family IDOR. Threat-model vector: `app-authz-idor`, T1 (function-level over-privilege, OWASP API5) — flagging as the **highest-priority backlog item** in this sweep given the T1 rating and that it's a real, verified gap (not just theoretical). |
| 4 | `app-authz-idor` | low | `release.yml`'s Semgrep gate runs `--severity ERROR` only, so the `kid-message-or-parent-route-missing-guard` WARNING rule never blocks a release even if a genuinely unguarded route ships. | **Confirmed, and worse than stated** — see the Semgrep section above: the rule is currently broken (inverted `pattern-not-inside`) and provides no real signal even as an advisory, on top of never being able to block. | **fix** (the underlying rule, see Semgrep section) — once fixed, still advisory-only per the runbook's tiering (WARNING rules don't block by design), which is a legitimate scoping choice, not a bug, per `docs/security/review-process.md`'s Tiers section — no separate action needed here beyond #1 in the Semgrep section. |
| 5 | `plat-compose-misconfig` | low | The release job's Trivy config scan (`scan-ref: docker-compose.yml`, `.github/workflows/release.yml:179`) doesn't cover `deploy/proxy/docker-compose.yml` (Traefik/TLS surface, `net-tls`) or `docker-compose.staging.yml` (basic-auth/API-router split, `net-exposure`). | **Confirmed** — `scan.sh` has the same narrow scope (`ops/security/scan.sh:76`, hardcoded to `docker-compose.yml`). | **backlog** — extend both `scan.sh` and the release job's Trivy step to scan all three compose files (or glob `docker-compose*.yml` + `deploy/proxy/docker-compose.yml`). Threat-model vectors: `net-tls` (T1) and `net-exposure` (T2) — the T1 one (`net-tls`) makes this worth doing soon, not indefinitely deferred. |
| 6 | `plat-cd-secrets` | low | `release.yml`'s new security-gate actions (`gitleaks/gitleaks-action@v2`, `google/osv-scanner-action@v1`, `aquasecurity/trivy-action@0.24.0`) are pinned to mutable tags, not commit SHAs, in a workflow with `fetch-depth: 0` and (bounded) read-only permissions. | **Confirmed** — exact strings verified at `.github/workflows/release.yml:158,162,176`. | **backlog** — pin to commit SHAs (`# comment with the version` alongside, per common practice) next time these actions are touched. Low urgency: job `permissions: contents: read` already bounds the blast radius (per the AI's own caveat), and this matches the existing pattern for other actions in the repo (would need a broader audit/policy decision, not a one-off fix here). Threat-model vector: `plat-cd-secrets`, T1 — technically T1-tagged but the practical risk here is bounded by read-only permissions, so backlog rather than urgent fix. |
| — | `app-secrets-in-code` | low | `.github/workflows/ci.yml:94` hardcodes `AUTH_JWT_SECRET: e2e-ci-only-jwt-secret-not-a-real-secret` as a workflow literal for the e2e job. | **Confirmed**, and I largely agree this is low-severity noise: it's clearly labeled non-real, CI-only, and gitleaks already needs to tolerate it (it's presumably covered by an existing allowlist entry, or would need one — didn't chase that down further as it's low-value). The AI's own caveat ("may require gitleaks allowlist churn") is a reasonable self-aware hedge. | **backlog**, low priority — if it ever gets copy-pasted toward a real deploy config it becomes a real problem, but as CI-only literal with an obviously-fake value, this is closer to a code-hygiene note than a security gap. Threat-model vector: `app-secrets-in-code`, T1 nominally, but I'd treat this one as over-tagged given the context — no forced action recommended beyond awareness. |

**On the AI stage generally:** none of the 6 notes were outright false
positives once traced — all pointed at something real in the code, though #3
needed real correction (the "cross-family" framing was wrong; the actual gap
is narrower). That's a reasonably good hit rate for a single advisory pass and
worth taking seriously going forward, while still verifying rather than
acting on the notes blindly (as this triage tried to model).

---

## Already-known app bug (not discovered by this sweep — recorded per task brief)

| item | detail |
|---|---|
| **Nullable-avatar / non-nullable schema mismatch** | `ParentKidMessageRowSchema.to_child_avatar` is `z.string()` (`packages/types/src/kid-message.ts:28`), but `ChildProfile.avatar` (`packages/db/prisma/schema.prisma:302`, `Avatar?`) is nullable — confirmed by reading both: the Prisma field is explicitly optional (`/// Legacy fixed-look id; null on rows created after the recolour system.`) while the Zod schema requires a string. **Impact:** parent-facing Messages endpoints 500 for any kid whose profile has a null `avatar` (i.e., any kid created after the recolour system shipped, since `avatar` is only backfilled on pre-existing rows). Surfaced during Task 6's dynamic-probe development (writing the IDOR probe's message fixture forced a `ChildProfile` with `avatar: null` through the schema). |
| **Disposition: fix** (not done in this task — surface only, per Task 8's constraints) | `packages/types/src/kid-message.ts:28` — change `to_child_avatar: z.string()` to `to_child_avatar: z.string().nullable()` (or `.nullish()` if `undefined` is also possible from the mapper), then handle the null case in the parent Messages UI (fallback avatar/initial, same pattern likely already used elsewhere for `ChildProfile.avatar` nulls). Threat-model relevance: none (this is a correctness/availability bug, not a security finding) — recorded here per the task brief, not because it's a security issue. |

---

## Waiver proposals summary (for user approval — none applied)

| fingerprint | proposed reason | proposed expiry |
|---|---|---|
| `osv:hono@4.12.23:GHSA-88fw-hqm2-52qc` | dev-only transitive dep via `@prisma/dev`, never in the production image | 2026-10-01 |
| `osv:vite@7.3.3:GHSA-fx2h-pf6j-xcff` | devDependency build tool, Windows-only dev-server CVE, never shipped/deployed on Windows | 2026-10-01 |

## Backlog summary (highest to lowest priority by threat-model tier)

1. **T1** `app-authz-idor` — kid-device PATCH `/api/profiles/:id` has no field-level allowlist beyond parent-ownership scoping (AI note #3, verified).
2. **T1** `plat-env-handling` — `.gitleaks.toml` allowlists `.env*.example` files by path, not by value pattern (AI note #1, verified).
3. **T1** `app-secrets-in-code` — `.gitleaks.toml`'s `staging-pass` allowlist regex is unanchored/global (AI note #2, verified).
4. **T1** `net-tls` (+ T2 `net-exposure`) — Trivy compose scan (`scan.sh` + release CI) only covers `docker-compose.yml`, misses `deploy/proxy/docker-compose.yml` and `docker-compose.staging.yml` (AI note #5, verified).
5. **T2** `app-supply-chain` — routine dependency bump for `prisma`/`vite`/`postcss` to clear the underlying CVEs even though current risk is waived as unreachable.
6. **T1 (bounded)** `plat-cd-secrets` — pin the three new gitleaks/osv/trivy GitHub Actions to commit SHAs instead of mutable tags (AI note #6, verified; risk bounded by read-only job permissions).
7. **Tooling** `.semgrep/gabee.yml`'s `kid-message-or-parent-route-missing-guard` rule has an inverted `pattern-not-inside` and fires on ~all routes regardless of guard presence — needs a rule fix, not an app fix (see Semgrep section).
8. **Hygiene, no security relevance** — scope the two docs-only Semgrep rule categories (`wildcard-postmessage-configuration`, `react-dangerouslysetinnerhtml`) away from `docs/**` handoff-prototype directories to cut sweep noise.
9. **Correctness bug, not security** — `to_child_avatar` nullable mismatch (see above) — flagging for the app owner, not proposing a fix here.

## Addendum — finding surfaced while hardening the probes (2026-07-15)

| finding | vector | tier | disposition |
|---|---|---|---|
| **App-level rate limiting is bypassable by rotating `X-Forwarded-For`.** `clientIpFrom()` (`apps/web/src/lib/server/rate-limit.ts`) buckets by the **first** `X-Forwarded-For` entry. Traefik *appends* the real client IP rather than replacing the header, so a client that sends its own `X-Forwarded-For: 1.2.3.4` controls the bucket key and can reset every limiter (login, signup, forgot-password, contact) at will by rotating the value. Demonstrated concretely: `rate-limit.spec.ts` now claims its own synthetic bucket (`10.99.0.1`) purely by setting that header. | `app-rate-limit` / `net-rate-limit-edge` | **needs decision** (the threat model already flagged "confirm the app-level limiter isn't trivially bypassed by rotating X-Forwarded-For" as a Plan 2 dynamic check — this confirms it IS) | **fix**: trust only the LAST `X-Forwarded-For` entry (the one the trusted proxy appended), or take Traefik's `X-Real-IP`, or set a trusted-proxy hop count. Until then the limiters deter only naive abuse. |

Note: this is the same property the probes rely on for bucket isolation, so fixing
it will require the rate-limit probe to isolate differently (e.g. per-run unique
credentials, or accepting a shared bucket and running that spec last).
