# Security human-judgment checklist

The residue the automated gate (`pnpm security:scan`) can't cover — things that
need a human to reason about intent, semantics, or context. Each item:
*what to check · where · cadence.* Pair this with the runbook
(`docs/security/review-process.md`).

## 1. Device-metadata privacy / retention / policy review

**The privacy-policy launch gate is still open.** Device metadata (`tz`,
`uaFull`, `osVersion`, `deviceModel`, screen/locale) sits on `Device`, and raw IP
history on `DeviceIpSighting`. Retention is **settled: 90 days** (decided
2026-07-14 — `device-ip-retention.ts` + the daily `/api/cron/purge-device-ips`),
but this must still not ship without an updated privacy policy + a documented
legal basis. Draft: `docs/privacy-device-metadata-disclosure-draft.md`.

- What:
  - Privacy policy covers every PII-shaped field captured, and states the
    90-day IP retention.
  - IP is read only behind `requireSuperAdmin` (never `requireAdmin` /
    `requireParent`), and never reaches logs/Sentry.
  - **The purge still runs.** Confirm `IP_RETENTION_DAYS` exists, the cron route
    is wired (`PURGE_IPS_URL` in `docker-compose.yml`), and it actually fired
    recently in prod. A dead sidecar or a renamed route reverts us to indefinite
    retention **silently** — nothing errors, the rows just stop disappearing.
  - **Backups lag the purge.** A purged IP survives in R2 dumps until the backup
    retention (14 d) expires them; if `BACKUP_RETENTION_DAYS` is raised, re-check
    the retention promise in the policy (`plat-r2-scope`).
  - **XFF trust.** The recorded IP must come from the **last** X-Forwarded-For
    hop — Traefik appends, so the first hop is caller-controlled and lets an
    attacker write a forged IP into the history. Fixed 2026-07-16 (PR #11):
    `request-meta.ts` and `rate-limit.ts` both read the last hop, with tests
    pinning it. Standing check: verify neither regresses to the first hop.
  - Revisit the deferred device-transfer decision (a device re-paired to another
    household currently no-ops rather than re-homing).
- Where: `packages/db/prisma/schema.prisma` (`Device`, `DeviceIpSighting`);
  `apps/web/src/lib/server/services/device-ip-retention.ts`;
  `apps/web/src/lib/server/request-meta.ts`; threat-model vectors
  `app-pii-exposure` + `plat-r2-scope`; `docs/privacy-device-metadata-disclosure-draft.md`.
- Cadence: before any release that touches metadata capture, and quarterly.

## 1b. Consent provability (T&C)

The legal basis for the PII above. Consent is only worth something if we can
**prove** it: who accepted which version, when (`ConsentRecord`, append-only).

- What: signup still cannot proceed without acceptance (`terms_accepted` is
  `z.literal(true)`, not a loose boolean); the recorded version is the **server**
  constant (`CURRENT_TERMS_VERSION`), never client-supplied; account + consent are
  still created in one transaction (no account without proof); `ConsentRecord` is
  never updated/deleted outside the parent cascade (history stays append-only);
  the parent-space re-consent gate isn't bypassable by a new route added outside
  the guarded layout. When the T&C text materially changes, `CURRENT_TERMS_VERSION`
  must be bumped — otherwise nobody is re-asked.
- Where: `apps/web/src/lib/terms.ts`, `api/auth/signup`, `api/auth/accept-terms`,
  `apps/web/src/app/parent/layout.tsx`, `services/consent.ts`; threat-model
  vector `app-consent-proof`.
- Cadence: on any change to signup/auth/T&C, and quarterly.

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

## 4. Disposable-email blocklist refresh

The signup guard uses a static, in-repo domain set — it only stays useful if
someone refreshes it; nothing automated will.

- What: re-curate `DISPOSABLE_DOMAINS` against the upstream
  [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains)
  list (add newly mainstream providers; we don't need the full ~4k list, just
  the well-known ones). Confirm the guard is still wired into every entry point
  that accepts a new email (today: signup; add email-change if it ships).
- Where: `apps/web/src/lib/server/disposable-emails.ts`;
  `apps/web/src/app/api/auth/signup/route.ts`.
- Cadence: quarterly.

## 5. Threat-model maintenance

Keep the taxonomy and routing in sync with what actually ships.

- What: when a new surface ships, add a vector row to
  `docs/security/threat-model.md` (permanent kebab `id`, real `surface`, `tier`,
  OWASP/ASVS/STRIDE `backing`) and add the matching route to
  `ops/security/routes.yml` so `scan.sh` scopes it. Never rename an `id` a waiver
  references — deprecate and add a new row.
- Where: `docs/security/threat-model.md`, `ops/security/routes.yml`.
- Cadence: per feature / new surface.
