# Security human-judgment checklist

The residue the automated gate (`pnpm security:scan`) can't cover — things that
need a human to reason about intent, semantics, or context. Each item:
*what to check · where · cadence.* Pair this with the runbook
(`docs/security/review-process.md`).

## 1. Device-metadata privacy / retention / policy review

**This is a pending launch gate.** Raw IP is retained indefinitely
(`DeviceIpSighting`, append-only) and device metadata (`tz`, `uaFull`,
`osVersion`, `deviceModel`, screen/locale) sits on the `Device` model — this must
not ship without an updated privacy policy.

- What: confirm the privacy policy covers every PII-shaped field captured;
  confirm IP is read only behind `requireSuperAdmin` (never `requireAdmin` /
  `requireParent`); revisit the raw-IP-indefinite-retention decision and the
  deferred device-transfer decision.
- Where: `packages/db/prisma/schema.prisma` (`Device`, `DeviceIpSighting`);
  threat-model vector `app-pii-exposure`; `docs/privacy-*` if present.
- Cadence: before any release that touches metadata capture, and quarterly.

## 2. Exploratory abuse hunting

Beyond the scripted Semgrep rules — reason about business-logic abuse the static
rules can't express.

- What: kid-app flows, device pairing / claim-code redemption, the star / gift
  economy (can a kid or parent mint or double-spend stars?), and auth edges
  (email-confirmation bypass, session-cookie scoping, cross-surface access).
- Where: `apps/web/src/app/api/**`, `apps/web/src/lib/server/`, kid app flows.
- Cadence: per-release for changed surfaces, plus periodic sweeps.

## 3. Dependency license + health review

osv-scanner covers CVEs, not licensing or abandonment.

- What: new/updated deps for incompatible or copyleft licenses, unmaintained /
  abandoned packages, and any dependency pinned to a git URL/tag instead of a
  registry version.
- Where: `pnpm-lock.yaml`, per-package `package.json` across the workspace.
- Cadence: monthly, and on every new dependency.

## 4. Threat-model maintenance

Keep the taxonomy and routing in sync with what actually ships.

- What: when a new surface ships, add a vector row to
  `docs/security/threat-model.md` (permanent kebab `id`, real `surface`, `tier`,
  OWASP/ASVS/STRIDE `backing`) and add the matching route to
  `ops/security/routes.yml` so `scan.sh` scopes it. Never rename an `id` a waiver
  references — deprecate and add a new row.
- Where: `docs/security/threat-model.md`, `ops/security/routes.yml`.
- Cadence: per feature / new surface.
