# Device metadata collection — design

- **Date:** 2026-07-10
- **Status:** Draft (awaiting review)
- **Author:** Valentine + Claude
- **Area:** kid PWA (`@gabee/kid`), web API/admin (`@gabee/web`), shared types (`@gabee/types`), DB (`@gabee/db`)

## 1. Context & motivation

Today we collect almost nothing about the kid device. Each analytics event
([`EventEnvelopeSchema`](../../../packages/types/src/events.ts)) carries only
`event_id`, `profile_id`, `session_id`, `client_ts`, `schema_version`, `payload`
plus a server-side `server_ts`. No IP, no user-agent, no OS, no screen, no
timezone. The only device-identifying string anywhere is `user_agent_hint` on
`DeviceLink`, captured once at pairing for the parent's "paired devices" list.

Two concrete gaps triggered this work:

1. **No "top playing hour" metric.** We want peak-hour analytics, but
   `client_ts` is generated with `new Date().toISOString()`
   ([`apps/kid/src/lib/events.ts`](../../../apps/kid/src/lib/events.ts)) — always
   UTC, offset dropped — and `z.iso.datetime()` only accepts UTC. So even the
   device's *local* hour is unrecoverable. We must start capturing timezone.
2. **No device visibility for security / support / device management.** We want
   OS, browser, IP, device details to serve anti-abuse, support/debug, product
   analytics, and the paired-devices view.

### Purposes (all four, confirmed)

| Purpose | Needs |
|---|---|
| Product analytics | Coarse/aggregate: peak hour, OS/browser mix, screen sizes, locale |
| Security / anti-abuse | IP + device id tied to identity; IP history |
| Support / debug | OS, browser, app version, screen, last-seen — per case |
| Device management | Device id, friendly name, last-seen, paired state |

### Privacy posture — explicit tension

The product spec **§9.1** commits Gabee to *"telemetry is per-child … GDPR-K
aligned"* — a deliberately data-minimal stance. This feature adds **raw IP tied
to the child's identity**, which is directly-identifying data.

**Retention decision (2026-07-14, supersedes the original):** raw IP is kept for
a **bounded 90-day window**, then purged automatically. The first cut of this
design kept it *indefinitely* (product-owner call, taken with the risk flagged);
that was revisited because indefinite retention of a minor's IP is the hardest
thing here to defend under GDPR-K storage-limitation, and a 90-day window
preserves the anti-abuse investigation value while removing the long tail of
PII. Implemented by `services/device-ip-retention.ts` + the daily
`/api/cron/purge-device-ips` job (§8).

> **BLOCKING PREREQUISITE:** Before this ships, the **privacy policy must be
> updated** and a **legal basis documented** (parental consent covering device
> identifiers + IP collection + the 90-day retention). This is a launch gate,
> tracked alongside implementation, not an afterthought.

## 2. Non-goals (YAGNI)

- **Geo resolution (country/city from IP).** Deferred. We store raw IP now;
  country/city derivation is a later chantier. Consequently "login from a new
  country" alerts and geo analytics are **out of scope** for v1.
- **Third-party geo/IP APIs.** Explicitly rejected — we will never send a
  minor's IP to an external service.
- **Never-online / anonymous devices.** Not possible: a device needs parent
  access (a device-bound bearer obtained at pairing/login) before it can sync
  anything. Every Device row is, by definition, an authenticated device.
- **Per-event device metadata.** Rejected as wasteful and maximally invasive.
- **Fingerprinting beyond what the UA/screen/tz already expose.** No canvas
  fingerprint, no cross-site identifiers.

## 3. Architecture overview

**Principle: decouple device *metadata* from the pairing *credential*.** We do
**not** modify `DeviceLink` (the auth credential). We add a metadata layer
alongside it.

- A **stable client device id** (localStorage UUID) identifies a browser/PWA
  install.
- A new **`Device`** table holds the latest snapshot per device id.
- A new **`DeviceIpSighting`** append-only log holds the IP history, bounded to
  the 90-day retention window (§8).
- The device snapshot **rides on the existing event-sync request** — no separate
  beacon endpoint — so offline behavior is identical to events (already solved).
- **Timezone is captured per session** in the `session_start` payload and stored
  on `session_classifications`, so hourly analytics is accurate to play time
  even when synced later.

### Offline behavior (explicit)

The kid PWA buffers events locally and batch-syncs on reconnect (§9.2/§9.3).

- **Client-side data** (device_id, tz + offset, locale, UA, screen, app version,
  PWA state): captured at play time, buffered with events, synced on reconnect.
  **Accurate to play time.**
- **Server-side data** (IP): only readable when a request reaches the server, so
  it is captured at **sync time**, not play time. `Device.last_ip` and
  `DeviceIpSighting.seen_at` reflect the reconnection. **Accepted caveat** —
  almost always the same family network; anti-abuse value preserved.
- **Peak hour** is computed from `tz` + `client_ts` (both client-side, play
  time), **never** from `server_ts`/IP — so it stays correct under deferred sync.

## 4. Data model

### 4.1 New: `Device`

One row per device id, upserted on each event sync.

| Column | Type | Source | Notes |
|---|---|---|---|
| `id` | uuid PK | server | |
| `deviceId` | string unique | client | localStorage UUID |
| `parentId` | uuid FK → ParentAccount | bearer | cascade delete |
| `deviceLinkId` | uuid? FK → DeviceLink | pairing | set when the paired device claims (see §6) |
| `uaFull` | string | client | raw UA |
| `os` / `osVersion` | string? | server (parsed from `uaFull`) | |
| `browser` / `browserVersion` | string? | server (parsed) | |
| `deviceType` | enum(mobile/tablet/desktop)? | server (parsed) | |
| `deviceModel` | string? | server (parsed) | often null on iOS |
| `screenW` / `screenH` | int? | client | CSS px |
| `dpr` | float? | client | devicePixelRatio |
| `tz` | string? | client | IANA, e.g. `Europe/Paris` |
| `tzOffsetMin` | int? | client | minutes from UTC |
| `locale` | string? | client | app language (fr/en) |
| `appVersion` | string? | client | kid build version |
| `pwaStandalone` | bool? | client | installed vs browser tab |
| `lastIp` | string? | server | raw; latest only |
| `firstSeen` | datetime | server | |
| `lastSeen` | datetime | server | |

Indexes: `@@unique([deviceId])`, `@@index([parentId])`, `@@index([deviceLinkId])`.

### 4.2 New: `DeviceIpSighting` (append-only)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `deviceId` | string FK → Device.deviceId | |
| `ip` | string | raw; purged after **90 days** (§8) |
| `uaFull` | string? | UA at sighting |
| `seenAt` | datetime | = sync time |

A row is appended only when the IP **changes** from `Device.lastIp` (dedupe
consecutive identical IPs). Indexes: `@@index([deviceId, seenAt])`.

### 4.3 Changed: `SessionClassification`

Add `tz String?` and `tzOffsetMin Int?`, populated from the `session_start`
payload. `startedAt` already exists. Local hour = `startedAt(UTC) + tzOffsetMin`.

### 4.4 Changed: `DeviceLink`

Add `clientDeviceId String?` — stamped at pair-claim so the admin panel can join
a paired credential to its metadata Device (shows label + paired state).

## 5. Shared types (`@gabee/types`)

- **`DeviceSnapshotSchema`** (new) — the client-collected block:
  `device_id, ua_full, screen_w, screen_h, dpr, tz, tz_offset_min, locale,
  app_version, pwa_standalone`.
- **`IngestEventsRequestSchema`** — add optional `device: DeviceSnapshotSchema`.
  The snapshot rides with the event batch.
- **`session_start` event** — add `tz: string` and `tz_offset_min: number`.
- Admin DTOs: `AdminDeviceRowSchema`, `AdminDeviceIpSightingSchema`,
  `HourlyUsageSchema` (24 buckets + peak hour).

## 6. Capture flow

1. **Client device id.** On first launch the kid app generates a UUID stored at
   `gabee.kid.device_id` (localStorage). Cleared storage / reinstall ⇒ new id
   (accepted, documented).
2. **Snapshot assembly.** At sync, the kid app attaches a `DeviceSnapshot`
   (`navigator.userAgent`, `screen.width/height`, `devicePixelRatio`,
   `Intl.DateTimeFormat().resolvedOptions().timeZone`,
   `-new Date().getTimezoneOffset()`, app language, build version,
   `matchMedia('(display-mode: standalone)').matches`).
3. **Server ingest.** `POST /api/events` (already `requireParent`):
   - reads **IP** from `X-Forwarded-For` (Traefik-set) and **UA** from headers,
   - **parses** `ua_full` → os/browser/type/model (server-side, single source),
   - **upserts** `Device` by `deviceId` (parentId from bearer), updates
     `lastSeen` and snapshot fields,
   - if IP changed vs `Device.lastIp`, **appends** a `DeviceIpSighting` and
     updates `lastIp`.
4. **Pairing join.** When the kid claims a pair token, stamp `clientDeviceId`
   onto the resulting `DeviceLink`. A later ingest sets `Device.deviceLinkId` by
   matching `Device.deviceId == DeviceLink.clientDeviceId` for that parent.
5. **Session tz.** `session_start` carries `tz` + `tz_offset_min`; the events
   service writes them onto the `session_classifications` row it already
   creates.

**UA parsing:** server-side via `ua-parser-js` (well-maintained, fully offline —
no network, no minor-IP leakage). Store both raw `uaFull` and parsed fields so we
can re-parse if the library improves.

**App version:** inject a build version into the kid PWA via Vite `define`
(sourced from the release tag / package version) so `app_version` is meaningful.

## 7. Admin surfacing

### 7.1 Devices panel — `/admin/devices` (or tab under Users)

Per family / device: OS, browser, type, screen, tz, locale, app version, PWA
state, paired label (via `deviceLinkId`), `lastSeen`, `lastIp`. Drill-down shows
the **IP history** (`DeviceIpSighting` list). Serves security + support + device
management.

### 7.2 Hourly usage — `/admin/analytics`

A 24-hour histogram of `session_start` counts bucketed by **local** hour
(`startedAt + tzOffsetMin`), with a highlighted **peak hour**. Sessions missing
tz (pre-deploy rows) are excluded and the excluded count is shown (no silent
truncation).

## 8. Access control & security

- Device panel is **admin-only**; **raw IP** (last IP + sightings) is gated to
  **super-admin**.
- **Never** log IP to app logs or Sentry (v2.6.0 lesson). No IP in error
  payloads, breadcrumbs, or analytics events.
- **GDPR cascade:** deleting a parent or child must delete `Device` +
  `DeviceIpSighting`. Wire into the existing GDPR deletion flow
  (`/admin/gdpr`) and verify cascades. `Device.parentId` cascades on
  ParentAccount delete.
- **Retention (decided 2026-07-14):** raw IP is kept for **90 days**, then
  purged. `IP_RETENTION_DAYS` + `purgeExpiredDeviceIps()` live in
  `apps/web/src/lib/server/services/device-ip-retention.ts`; the daily
  `POST /api/cron/purge-device-ips` endpoint (CRON_SECRET-gated, fail-closed)
  runs it, poked by the existing `cron-digest` sidecar (`PURGE_IPS_URL`). The
  purge deletes `DeviceIpSighting` rows older than the cutoff AND clears
  `Device.lastIp` for devices not seen since — an active device's `lastIp` is
  inside the window by definition. Idempotent. Geo derivation deferred (§2), so
  nothing is retained past the window today; if country/city is added later it
  can outlive the raw IP.

## 9. Migration & backfill

- Additive migrations only (new tables + nullable columns) → zero-downtime,
  consistent with prior avatar-dimension migrations.
- No backfill possible for tz/device on historical rows (data never existed);
  hourly analytics simply starts accumulating from deploy. State this in the UI.

## 10. Testing

- **Types:** contract tests for `DeviceSnapshotSchema`, extended
  `IngestEventsRequestSchema`, `session_start` with tz.
- **Server:** ingest upserts Device + appends IpSighting on IP change only;
  UA parsing maps representative UAs (iOS Safari, Android Chrome, desktop);
  X-Forwarded-For parsing behind proxy.
- **Analytics:** local-hour bucketing across offsets (e.g. a session at
  `client_ts` 20:00 UTC with `tz_offset_min` +120 buckets to 22:00 local); peak
  hour selection; pre-tz rows excluded.
- **A11y/UI:** admin panel table + histogram.

## 11. Deferred / open items

- Geo resolution (country/city) via **local GeoLite2** DB on the VPS — needs a
  free MaxMind account + periodic DB refresh. Enables new-country alerts + geo
  analytics.
- Cross-device family view / suspicious-login heuristics (anti-abuse phase 2).
