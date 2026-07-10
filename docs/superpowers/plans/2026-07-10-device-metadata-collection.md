# Device Metadata Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture kid-device metadata (timezone, IP history, OS/browser, screen, app version) to serve product analytics (peak playing hour), security/anti-abuse, support/debug, and device management.

**Architecture:** Decouple device *metadata* from the pairing *credential*. A stable client-generated device id (localStorage) keys a new `Device` table; an append-only `DeviceIpSighting` log holds indefinite IP history. The device snapshot rides on the existing `POST /api/events` sync request (offline behaviour matches events); the server reads IP/UA from that request and parses the UA server-side. Per-session timezone is stored on `session_classifications` so peak-hour analytics is accurate under deferred sync.

**Tech Stack:** Next.js 16 (App Router, route handlers), Prisma 7 + PostgreSQL, Zod (`@gabee/types`), React 19 kid PWA (Vite 7), `ua-parser-js` (server-side UA parsing), `node:test` + `tsx` for pure-unit tests.

## Global Constraints

- **Privacy (BLOCKING launch gate):** Raw IP is retained indefinitely in `DeviceIpSighting`. Before this ships, the privacy policy + a documented legal basis (parental consent for device identifiers + IP + indefinite retention) MUST be updated. Not a code task — a release gate.
- **No IP in logs/telemetry:** Never write raw IP to `console`, app logs, Sentry, breadcrumbs, or analytics events (v2.6.0 leak lesson).
- **No third-party geo/IP calls:** Geo resolution is deferred; a minor's IP must never leave our infra.
- **Additive migrations only:** New tables + nullable columns; zero-downtime. No backfill of tz/device (data never existed).
- **UA parsed server-side only:** Client sends raw UA; server parses. Store both raw + parsed.
- **Peak hour from client time only:** Compute local hour from `tz_offset_min` + `client_ts`, never from `server_ts`/IP.
- **Access control:** Device panel is admin-only; raw IP (last IP + sightings) is super-admin-only.
- **GDPR cascade:** Deleting a parent/child deletes their `Device` + `DeviceIpSighting`.
- **Node:** keg-only node@20 (≥20.19 for Prisma 7). **Secrets:** never in `.env.*.example`.
- **Local dev DB:** Postgres 14, db `gabee`, trust auth as `valentine` on :5432.

---

## File Structure

**Shared types (`packages/types/src/`):**
- Modify `events.ts` — add `tz`/`tz_offset_min` to `SessionStartEvent`.
- Create `device.ts` — `DeviceSnapshotSchema`.
- Modify `api/events.ts` (or wherever `IngestEventsRequestSchema` lives) — add optional `device`.
- Create `api/admin-devices.ts` — `AdminDeviceRowSchema`, `AdminDeviceIpSightingSchema`, `HourlyUsageSchema`.
- Modify `index.ts` — re-export new modules.
- Modify `test/contracts.test.ts` — cover new schemas.

**DB (`packages/db/prisma/`):**
- Modify `schema.prisma` — `Device`, `DeviceIpSighting` models; `SessionClassification.tz`/`tzOffsetMin`; `DeviceLink.clientDeviceId`.
- Create migration folder under `migrations/`.

**Web server (`apps/web/src/lib/server/`):**
- Create `ua.ts` + `ua.test.ts` — UA parse wrapper.
- Create `request-meta.ts` + `request-meta.test.ts` — IP + UA extraction from `NextRequest`.
- Create `services/devices-metadata.ts` — `upsertDeviceFromSnapshot(...)`.
- Modify `services/events.ts` — thread device snapshot + request meta + session tz.
- Modify `services/pair.ts` (pair-claim) — stamp `clientDeviceId`.
- Create `services/hourly-usage.ts` + `hourly-usage.test.ts` — local-hour bucketing.
- Create `services/admin-devices.ts` — device list + IP history queries.
- Modify `app/api/events/route.ts` — pass request meta + device to `ingestEvents`.

**Web admin (`apps/web/src/app/admin/`):**
- Create `devices/page.tsx` + `devices/DevicesClient.tsx` — device panel.
- Modify `analytics/page.tsx` — hourly histogram + peak hour.
- Modify `analytics/AnalyticsNav.tsx` (if present) — nav entry.

**Web test harness (`apps/web/`):**
- Modify `package.json` — add `"test": "node --import tsx --test 'src/**/*.test.ts'"` and `tsx`/`ua-parser-js` deps.

**Kid app (`apps/kid/src/`):**
- Create `lib/device.ts` — client device id + snapshot assembly.
- Modify `lib/events.ts` (sync) — attach snapshot to the ingest body; add tz to session_start.
- Modify `vite.config.ts` — inject `__APP_VERSION__`.

**GDPR:**
- Modify `services/gdpr.ts` (deletion flow) — include new tables; verify cascade.

---

## Task 1: Shared types — session_start tz + DeviceSnapshot + ingest field

**Files:**
- Modify: `packages/types/src/events.ts` (SessionStartEvent ~line 54)
- Create: `packages/types/src/device.ts`
- Modify: `packages/types/src/index.ts`
- Modify: the file exporting `IngestEventsRequestSchema` (find with grep below)
- Test: `packages/types/test/contracts.test.ts`

**Interfaces:**
- Produces: `DeviceSnapshotSchema` / `DeviceSnapshot`; `SessionStartEvent` gains `tz: string`, `tz_offset_min: number`; `IngestEventsRequestSchema` gains optional `device?: DeviceSnapshot`.

- [ ] **Step 1: Locate the ingest request schema**

Run: `grep -rn "IngestEventsRequestSchema" packages/types/src`
Note the file path (referred to below as `<ingest-file>`).

- [ ] **Step 2: Write failing contract tests**

Add to `packages/types/test/contracts.test.ts` (inside the file, new `describe`):

```ts
import { DeviceSnapshotSchema, IngestEventsRequestSchema } from '../src/index';

describe('DeviceSnapshot', () => {
  it('accepts a full snapshot', () => {
    const s = DeviceSnapshotSchema.parse({
      device_id: '22222222-2222-4222-8222-222222222222',
      ua_full: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)…',
      screen_w: 390, screen_h: 844, dpr: 3,
      tz: 'Europe/Paris', tz_offset_min: 120,
      locale: 'fr', app_version: 'v2.7.1', pwa_standalone: true,
    });
    assert.equal(s.tz, 'Europe/Paris');
  });

  it('is optional on the ingest request', () => {
    const r = IngestEventsRequestSchema.parse({ events: [] });
    assert.equal(r.device, undefined);
  });
});

describe('session_start tz', () => {
  it('carries tz + offset', () => {
    const env = EventEnvelopeSchema.parse({
      event_id: UUID, profile_id: UUID2, session_id: UUID2, client_ts: NOW,
      event: { name: 'session_start', initiation_label: null, tz: 'Europe/Paris', tz_offset_min: 120 },
    });
    if (env.event.name === 'session_start') assert.equal(env.event.tz_offset_min, 120);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @gabee/types test`
Expected: FAIL — `DeviceSnapshotSchema` is not exported / unknown key `tz`.

- [ ] **Step 4: Create `device.ts`**

```ts
import { z } from 'zod';
import { LanguageSchema } from './enums';

/**
 * Client-collected device snapshot (design 2026-07-10). Rides on the event-sync
 * request; the SERVER adds IP + parses the UA. Kept minimal — no fingerprinting
 * beyond what the UA/screen/tz already expose.
 */
export const DeviceSnapshotSchema = z.object({
  /** Stable per-install id (localStorage UUID). */
  device_id: z.uuid(),
  /** Raw user-agent; parsed server-side into os/browser/type. */
  ua_full: z.string().max(400),
  screen_w: z.number().int().positive().max(20000).nullable().default(null),
  screen_h: z.number().int().positive().max(20000).nullable().default(null),
  dpr: z.number().positive().max(10).nullable().default(null),
  /** IANA zone, e.g. "Europe/Paris". */
  tz: z.string().max(64),
  /** Minutes from UTC (e.g. +120 for CEST). */
  tz_offset_min: z.number().int().min(-1000).max(1000),
  locale: LanguageSchema,
  app_version: z.string().max(40).nullable().default(null),
  pwa_standalone: z.boolean().default(false),
});
export type DeviceSnapshot = z.infer<typeof DeviceSnapshotSchema>;
```

- [ ] **Step 5: Add tz to `SessionStartEvent`**

In `packages/types/src/events.ts`, replace the `SessionStartEvent` object body:

```ts
export const SessionStartEvent = z.object({
  name: z.literal('session_start'),
  /** null until the parent classifies the session (product §9.3, §13.2). */
  initiation_label: InitiationLabelSchema.nullable().default(null),
  /** IANA zone + minutes-from-UTC at play time — drives local peak-hour
   *  analytics even when synced later. Optional for back-compat with older
   *  clients (pre-2026-07 rows have neither). */
  tz: z.string().max(64).optional(),
  tz_offset_min: z.number().int().min(-1000).max(1000).optional(),
});
```

- [ ] **Step 6: Add optional `device` to the ingest request**

In `<ingest-file>`, import `DeviceSnapshotSchema` and add to the request object:

```ts
device: DeviceSnapshotSchema.optional(),
```

- [ ] **Step 7: Re-export from index**

In `packages/types/src/index.ts` add:

```ts
export * from './device';
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @gabee/types test`
Expected: PASS (all contract tests, including existing ones).

- [ ] **Step 9: Typecheck the workspace**

Run: `pnpm -w typecheck` (or `pnpm --filter @gabee/types exec tsc --noEmit`)
Expected: 0 errors.

- [ ] **Step 10: Commit**

```bash
git add packages/types/src/device.ts packages/types/src/events.ts packages/types/src/index.ts packages/types/test/contracts.test.ts <ingest-file>
git commit -m "feat(types): DeviceSnapshot + session_start tz + optional ingest device"
```

---

## Task 2: DB schema + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: migration via prisma
- Test: verification query against local `gabee` DB

**Interfaces:**
- Produces: `Device`, `DeviceIpSighting` models; `SessionClassification.tz`/`tzOffsetMin`; `DeviceLink.clientDeviceId`. Prisma client types for these.

- [ ] **Step 1: Add models + columns to `schema.prisma`**

Append near the other device models:

```prisma
enum DeviceType {
  mobile
  tablet
  desktop
}

/// Per-install device metadata (design 2026-07-10). Keyed by a client-generated
/// deviceId (localStorage). Upserted on each event sync; the snapshot fields are
/// client-provided, os/browser/type parsed server-side from uaFull, lastIp read
/// from the request. Decoupled from DeviceLink (the pairing credential).
model Device {
  id             String      @id @default(uuid()) @db.Uuid
  deviceId       String      @unique @map("device_id")
  parentId       String      @map("parent_id") @db.Uuid
  deviceLinkId   String?     @map("device_link_id") @db.Uuid
  uaFull         String      @map("ua_full")
  os             String?
  osVersion      String?     @map("os_version")
  browser        String?
  browserVersion String?     @map("browser_version")
  deviceType     DeviceType? @map("device_type")
  deviceModel    String?     @map("device_model")
  screenW        Int?        @map("screen_w")
  screenH        Int?        @map("screen_h")
  dpr            Float?
  tz             String?
  tzOffsetMin    Int?        @map("tz_offset_min")
  locale         String?
  appVersion     String?     @map("app_version")
  pwaStandalone  Boolean?    @map("pwa_standalone")
  lastIp         String?     @map("last_ip")
  firstSeen      DateTime    @default(now()) @map("first_seen")
  lastSeen       DateTime    @default(now()) @map("last_seen")

  parent   ParentAccount @relation(fields: [parentId], references: [id], onDelete: Cascade)
  sightings DeviceIpSighting[]

  @@index([parentId])
  @@index([deviceLinkId])
  @@map("devices")
}

/// Append-only IP history for a device (design 2026-07-10). Indefinite retention
/// lives here (product decision). A row is appended only when the IP changes.
model DeviceIpSighting {
  id       String   @id @default(uuid()) @db.Uuid
  deviceId String   @map("device_id")
  ip       String
  uaFull   String?  @map("ua_full")
  seenAt   DateTime @default(now()) @map("seen_at")

  device Device @relation(fields: [deviceId], references: [deviceId], onDelete: Cascade)

  @@index([deviceId, seenAt])
  @@map("device_ip_sightings")
}
```

Add to `model SessionClassification`:

```prisma
  tz          String?  // IANA zone from session_start
  tzOffsetMin Int?     @map("tz_offset_min")
```

Add to `model DeviceLink`:

```prisma
  clientDeviceId String? @map("client_device_id")
```

Add the relation field to `model ParentAccount` (find it and add):

```prisma
  devices Device[]
```

- [ ] **Step 2: Create the migration**

Run:
```bash
pnpm --filter @gabee/db exec prisma migrate dev --name device_metadata --create-only
```
Expected: a new folder `packages/db/prisma/migrations/<ts>_device_metadata/migration.sql`.

- [ ] **Step 3: Sanity-check the migration is additive**

Run: `grep -iE "DROP|ALTER .* DROP|NOT NULL" packages/db/prisma/migrations/*device_metadata*/migration.sql`
Expected: no `DROP`; any new columns are nullable or have defaults. (New tables are fine.)

- [ ] **Step 4: Apply + regenerate client**

Run:
```bash
pnpm --filter @gabee/db exec prisma migrate dev --name device_metadata
```
Expected: migration applies to local `gabee`; client regenerates.

- [ ] **Step 5: Verify tables exist**

Run: `psql -d gabee -c "\d devices" -c "\d device_ip_sightings"`
Expected: both tables listed with the expected columns.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): Device + DeviceIpSighting tables, session tz, DeviceLink.clientDeviceId"
```

---

## Task 3: Server UA parsing helper

**Files:**
- Create: `apps/web/src/lib/server/ua.ts`
- Create: `apps/web/src/lib/server/ua.test.ts`
- Modify: `apps/web/package.json` (add `ua-parser-js`, `tsx`, test script)

**Interfaces:**
- Produces: `parseUa(ua: string): { os: string|null; osVersion: string|null; browser: string|null; browserVersion: string|null; deviceType: 'mobile'|'tablet'|'desktop'|null; deviceModel: string|null }`

- [ ] **Step 1: Add deps + test script**

Run:
```bash
pnpm --filter @gabee/web add ua-parser-js
pnpm --filter @gabee/web add -D tsx @types/ua-parser-js
```
Then add to `apps/web/package.json` `"scripts"`:
```json
"test": "node --import tsx --test 'src/**/*.test.ts'"
```

- [ ] **Step 2: Write failing test**

`apps/web/src/lib/server/ua.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUa } from './ua';

test('parses iOS Safari', () => {
  const r = parseUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  assert.equal(r.os, 'iOS');
  assert.equal(r.deviceType, 'mobile');
  assert.equal(r.browser, 'Mobile Safari');
});

test('parses Android Chrome', () => {
  const r = parseUa('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');
  assert.equal(r.os, 'Android');
  assert.equal(r.browser, 'Chrome');
  assert.equal(r.deviceType, 'mobile');
});

test('desktop has null deviceType from parser mapped to desktop', () => {
  const r = parseUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  assert.equal(r.deviceType, 'desktop');
});

test('empty UA is all-null but desktop', () => {
  const r = parseUa('');
  assert.equal(r.os, null);
  assert.equal(r.deviceType, 'desktop');
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @gabee/web test`
Expected: FAIL — `./ua` not found.

- [ ] **Step 4: Implement `ua.ts`**

```ts
import { UAParser } from 'ua-parser-js';

export interface ParsedUa {
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  deviceType: 'mobile' | 'tablet' | 'desktop' | null;
  deviceModel: string | null;
}

/**
 * Parse a raw user-agent server-side (single source of truth; re-parsable if the
 * library improves). ua-parser reports device.type only for mobile/tablet/etc;
 * absent type ⇒ desktop.
 */
export function parseUa(ua: string): ParsedUa {
  const r = new UAParser(ua).getResult();
  const t = r.device.type;
  const deviceType = t === 'mobile' || t === 'tablet' ? t : 'desktop';
  return {
    os: r.os.name ?? null,
    osVersion: r.os.version ?? null,
    browser: r.browser.name ?? null,
    browserVersion: r.browser.version ?? null,
    deviceType,
    deviceModel: r.device.model ?? null,
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @gabee/web test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/server/ua.ts apps/web/src/lib/server/ua.test.ts pnpm-lock.yaml
git commit -m "feat(web): server-side UA parser (ua-parser-js) + test harness"
```

---

## Task 4: Request meta (IP + UA) extraction

**Files:**
- Create: `apps/web/src/lib/server/request-meta.ts`
- Create: `apps/web/src/lib/server/request-meta.test.ts`

**Interfaces:**
- Produces: `getRequestMeta(req: { headers: Headers }): { ip: string | null; ua: string | null }`

- [ ] **Step 1: Write failing test**

`apps/web/src/lib/server/request-meta.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRequestMeta } from './request-meta';

function req(h: Record<string, string>) {
  return { headers: new Headers(h) };
}

test('takes first hop of x-forwarded-for', () => {
  const m = getRequestMeta(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'X' }));
  assert.equal(m.ip, '203.0.113.7');
  assert.equal(m.ua, 'X');
});

test('falls back to x-real-ip', () => {
  const m = getRequestMeta(req({ 'x-real-ip': '203.0.113.9' }));
  assert.equal(m.ip, '203.0.113.9');
});

test('null when no ip headers', () => {
  const m = getRequestMeta(req({}));
  assert.equal(m.ip, null);
  assert.equal(m.ua, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gabee/web test`
Expected: FAIL — `./request-meta` not found.

- [ ] **Step 3: Implement `request-meta.ts`**

```ts
/**
 * Extract client IP + UA from a request. Behind Traefik, the client IP is the
 * FIRST hop of X-Forwarded-For (subsequent hops are proxies). NEVER log the
 * returned ip.
 */
export function getRequestMeta(req: { headers: Headers }): { ip: string | null; ua: string | null } {
  const xff = req.headers.get('x-forwarded-for');
  const ip = xff
    ? (xff.split(',')[0]?.trim() || null)
    : (req.headers.get('x-real-ip')?.trim() || null);
  const ua = req.headers.get('user-agent')?.trim() || null;
  return { ip, ua };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @gabee/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/request-meta.ts apps/web/src/lib/server/request-meta.test.ts
git commit -m "feat(web): request IP/UA extraction (x-forwarded-for first hop)"
```

---

## Task 5: Device upsert service + wire into ingest

**Files:**
- Create: `apps/web/src/lib/server/services/devices-metadata.ts`
- Modify: `apps/web/src/lib/server/services/events.ts`
- Modify: `apps/web/src/app/api/events/route.ts`

**Interfaces:**
- Consumes: `parseUa` (Task 3), `getRequestMeta` (Task 4), `DeviceSnapshot` (Task 1), Prisma `Device`/`DeviceIpSighting` (Task 2).
- Produces: `upsertDeviceFromSnapshot(parentId, snapshot, meta): Promise<void>`; `ingestEvents(parentId, events, opts?)` gains `opts?: { device?: DeviceSnapshot; ip?: string | null }`.

- [ ] **Step 1: Implement `devices-metadata.ts`**

```ts
import type { DeviceSnapshot } from '@gabee/types';
import { prisma } from '../db';
import { parseUa } from '../ua';

/**
 * Upsert the Device row from a client snapshot + request IP. Appends a
 * DeviceIpSighting only when the IP changed vs the stored lastIp (dedupe
 * consecutive identical IPs). UA is parsed server-side. NEVER log `ip`.
 */
export async function upsertDeviceFromSnapshot(
  parentId: string,
  snapshot: DeviceSnapshot,
  ip: string | null,
): Promise<void> {
  const parsed = parseUa(snapshot.ua_full);
  const existing = await prisma.device.findUnique({
    where: { deviceId: snapshot.device_id },
    select: { id: true, lastIp: true, parentId: true },
  });

  const common = {
    parentId,
    uaFull: snapshot.ua_full,
    os: parsed.os,
    osVersion: parsed.osVersion,
    browser: parsed.browser,
    browserVersion: parsed.browserVersion,
    deviceType: parsed.deviceType,
    deviceModel: parsed.deviceModel,
    screenW: snapshot.screen_w,
    screenH: snapshot.screen_h,
    dpr: snapshot.dpr,
    tz: snapshot.tz,
    tzOffsetMin: snapshot.tz_offset_min,
    locale: snapshot.locale,
    appVersion: snapshot.app_version,
    pwaStandalone: snapshot.pwa_standalone,
    lastSeen: new Date(),
    ...(ip ? { lastIp: ip } : {}),
  };

  await prisma.device.upsert({
    where: { deviceId: snapshot.device_id },
    create: { deviceId: snapshot.device_id, ...common },
    update: common,
  });

  // Append a sighting when the IP is new for this device.
  if (ip && ip !== existing?.lastIp) {
    await prisma.deviceIpSighting.create({
      data: { deviceId: snapshot.device_id, ip, uaFull: snapshot.ua_full },
    });
  }

  // Link to the pairing credential if one carries this client device id.
  const link = await prisma.deviceLink.findFirst({
    where: { parentId, clientDeviceId: snapshot.device_id, revokedAt: null },
    select: { id: true },
  });
  if (link) {
    await prisma.device.update({
      where: { deviceId: snapshot.device_id },
      data: { deviceLinkId: link.id },
    });
  }
}
```

- [ ] **Step 2: Thread device + ip + session tz through `ingestEvents`**

In `services/events.ts`, change the signature and body:

```ts
import type { DeviceSnapshot, EventEnvelope, IngestEventsResponse } from '@gabee/types';
import { upsertDeviceFromSnapshot } from './devices-metadata';

export async function ingestEvents(
  parentId: string,
  events: EventEnvelope[],
  opts?: { device?: DeviceSnapshot; ip?: string | null },
): Promise<IngestEventsResponse> {
  // …existing body up to the return…

  if (opts?.device) {
    // Best-effort: metadata capture must never fail event ingestion.
    try {
      await upsertDeviceFromSnapshot(parentId, opts.device, opts.ip ?? null);
    } catch (err) {
      console.error('[events] device metadata upsert failed'); // NOTE: no ip/ua in the log
    }
  }

  return { accepted, duplicates: rows.length - accepted, rejected };
}
```

And in `maintainClassificationQueue`, persist session tz on the `session_start` upsert:

```ts
    if (e.name === 'session_start') {
      await prisma.sessionClassification.upsert({
        where: { sessionId },
        create: {
          sessionId, profileId: env.profile_id, startedAt: new Date(env.client_ts),
          tz: e.tz ?? null, tzOffsetMin: e.tz_offset_min ?? null,
        },
        update: { tz: e.tz ?? null, tzOffsetMin: e.tz_offset_min ?? null },
      });
    }
```

- [ ] **Step 3: Pass request meta + device from the route**

Rewrite `app/api/events/route.ts`:

```ts
import { IngestEventsRequestSchema, type IngestEventsResponse } from '@gabee/types';
import { route, readJson, json, requireParent } from '@/lib/server/http';
import { getRequestMeta } from '@/lib/server/request-meta';
import { ingestEvents } from '@/lib/server/services/events';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const session = await requireParent(req);
  const { events, device } = await readJson(req, IngestEventsRequestSchema);
  const { ip } = getRequestMeta(req);
  const result = await ingestEvents(session.parentId, events, { device, ip });
  return json<IngestEventsResponse>(result);
});
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @gabee/web exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Integration verify against local DB**

Start the web dev server, then POST a batch with a device snapshot (use a real parent bearer from your dev login, or a scratch script). Minimal check via psql after a synced session:

Run: `psql -d gabee -c "select device_id, os, browser, device_type, last_ip, tz from devices order by last_seen desc limit 3;" -c "select count(*) from device_ip_sightings;"`
Expected: a row for your device with parsed os/browser and an ip; ≥1 sighting.

- [ ] **Step 6: Verify IP-dedup (no duplicate sighting on same IP)**

Sync twice from the same network. Run: `psql -d gabee -c "select ip, count(*) from device_ip_sightings group by ip;"`
Expected: the count for your IP stays 1 across the two syncs.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/server/services/devices-metadata.ts apps/web/src/lib/server/services/events.ts apps/web/src/app/api/events/route.ts
git commit -m "feat(web): capture device metadata + IP history on event sync; store session tz"
```

---

## Task 6: Stamp clientDeviceId at pair-claim

**Files:**
- Modify: pairing claim service (find below) + its request type if needed

**Interfaces:**
- Consumes: `DeviceLink.clientDeviceId` (Task 2).
- Produces: paired devices carry `clientDeviceId`, enabling `Device.deviceLinkId` linkage (Task 5).

- [ ] **Step 1: Locate the claim flow**

Run: `grep -rn "clientDeviceId\|resultingDeviceId\|deviceLink.create\|claimPair\|claimPairToken\|user_agent_hint" apps/web/src/lib/server`
Note the claim service + where `DeviceLink` is created.

- [ ] **Step 2: Accept + persist client device id**

The kid already sends `user_agent_hint` on claim (`apps/kid/src/lib/pair.ts`). Add `client_device_id` alongside it:
- In the claim request Zod schema (`packages/types/src/family.ts`, `ClaimPairCodeRequest`/`ClaimDevicePairRequest`), add:
  ```ts
  client_device_id: z.uuid().optional(),
  ```
- In the claim service, when creating the `DeviceLink`, set `clientDeviceId: input.client_device_id ?? null`.

- [ ] **Step 3: Send it from the kid app**

In `apps/kid/src/lib/pair.ts` (and `LinkDeviceCode.tsx` if it builds its own body), add to the claim body:
```ts
client_device_id: getDeviceId(), // from lib/device.ts (Task 7)
```
(If Task 7 not yet done, use the same localStorage read inline; Task 7 refactors it.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @gabee/web exec tsc --noEmit && pnpm --filter @gabee/kid exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Verify link populated**

Pair a dev device, sync once, then:
Run: `psql -d gabee -c "select d.device_id, d.device_link_id, l.client_device_id from devices d join device_links l on l.client_device_id = d.device_id limit 3;"`
Expected: `device_link_id` populated for the paired device.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/family.ts apps/web/src/lib/server apps/kid/src/lib/pair.ts
git commit -m "feat(pairing): stamp clientDeviceId on DeviceLink to join metadata"
```

---

## Task 7: Kid client — device id, snapshot, tz on session_start

**Files:**
- Create: `apps/kid/src/lib/device.ts`
- Modify: `apps/kid/src/lib/events.ts` (sync body + session_start emit)
- Modify: `apps/kid/vite.config.ts`

**Interfaces:**
- Produces: `getDeviceId(): string`, `buildDeviceSnapshot(lang): DeviceSnapshot`. Sync request body gains `device`. `session_start` events include `tz` + `tz_offset_min`.

- [ ] **Step 1: Inject app version via Vite**

In `apps/kid/vite.config.ts`, add to `defineConfig`:
```ts
define: {
  __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? 'dev'),
},
```
And declare the global in `apps/kid/src/vite-env.d.ts` (or a `globals.d.ts`):
```ts
declare const __APP_VERSION__: string;
```
(Release CD should later pass `VITE_APP_VERSION=<tag>` as a build arg — note for deploy, not blocking.)

- [ ] **Step 2: Implement `lib/device.ts`**

```ts
import type { DeviceSnapshot } from '@gabee/types';

const KEY = 'gabee.kid.device_id';

/** Stable per-install device id. Reset on cleared storage / reinstall (accepted). */
export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Assemble the client device snapshot sent with the event batch. */
export function buildDeviceSnapshot(locale: 'fr' | 'en'): DeviceSnapshot {
  const standalone =
    typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches;
  return {
    device_id: getDeviceId(),
    ua_full: navigator.userAgent.slice(0, 400),
    screen_w: window.screen?.width ?? null,
    screen_h: window.screen?.height ?? null,
    dpr: window.devicePixelRatio ?? null,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tz_offset_min: -new Date().getTimezoneOffset(),
    locale,
    app_version: __APP_VERSION__,
    pwa_standalone: standalone,
  };
}
```

- [ ] **Step 3: Attach snapshot to the sync body**

In `apps/kid/src/lib/events.ts`, find where the batch is POSTed to `/api/events` and add `device: buildDeviceSnapshot(<currentLang>)` to the request body. Read the current language from the store (`useStore.getState().lang`) or the value already threaded there.

- [ ] **Step 4: Add tz to session_start emission**

Find where `session_start` is created (grep `session_start` in `apps/kid/src`) and include:
```ts
tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
tz_offset_min: -new Date().getTimezoneOffset(),
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @gabee/kid exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Manual smoke in the running kid app**

Start kid dev (`pnpm --filter @gabee/kid dev`), play a short session while a paired dev bearer is active, let it sync. Confirm via the Task 5 psql checks that a `devices` row now shows `app_version` and `tz`, and `session_classifications` has a non-null `tz` for the new session:
Run: `psql -d gabee -c "select session_id, tz, tz_offset_min from session_classifications where tz is not null order by started_at desc limit 3;"`
Expected: the just-played session with its tz.

- [ ] **Step 7: Commit**

```bash
git add apps/kid/src/lib/device.ts apps/kid/src/lib/events.ts apps/kid/vite.config.ts apps/kid/src/vite-env.d.ts
git commit -m "feat(kid): client device id + snapshot on sync; tz on session_start"
```

---

## Task 8: Hourly usage analytics (service + admin histogram)

**Files:**
- Create: `apps/web/src/lib/server/services/hourly-usage.ts`
- Create: `apps/web/src/lib/server/services/hourly-usage.test.ts`
- Modify: `apps/web/src/app/admin/analytics/page.tsx`

**Interfaces:**
- Consumes: `SessionClassification.tz`/`tzOffsetMin` (Task 2).
- Produces: `localHourOf(startedAtUtc: Date, tzOffsetMin: number): number` (0–23); `getHourlyUsage(): Promise<{ buckets: number[]; peakHour: number | null; excludedNoTz: number }>`.

- [ ] **Step 1: Write failing test for the pure bucketing fn**

`apps/web/src/lib/server/services/hourly-usage.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localHourOf } from './hourly-usage';

test('adds offset and wraps to 0-23', () => {
  // 20:00 UTC + 120min = 22:00 local
  assert.equal(localHourOf(new Date('2026-07-10T20:00:00Z'), 120), 22);
  // 23:30 UTC + 60min = 00:30 local → hour 0
  assert.equal(localHourOf(new Date('2026-07-10T23:30:00Z'), 60), 0);
  // 01:00 UTC - 180min = 22:00 previous day → hour 22
  assert.equal(localHourOf(new Date('2026-07-10T01:00:00Z'), -180), 22);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gabee/web test`
Expected: FAIL — `./hourly-usage` not found.

- [ ] **Step 3: Implement `hourly-usage.ts`**

```ts
import { prisma } from '../db';

/** Local hour (0–23) of a UTC instant given a minutes-from-UTC offset. */
export function localHourOf(startedAtUtc: Date, tzOffsetMin: number): number {
  const shifted = new Date(startedAtUtc.getTime() + tzOffsetMin * 60_000);
  return shifted.getUTCHours();
}

export interface HourlyUsage {
  buckets: number[]; // length 24
  peakHour: number | null;
  excludedNoTz: number;
}

/** 24-bucket histogram of session starts by LOCAL hour; peak hour highlighted. */
export async function getHourlyUsage(): Promise<HourlyUsage> {
  const [withTz, excluded] = await Promise.all([
    prisma.sessionClassification.findMany({
      where: { tzOffsetMin: { not: null } },
      select: { startedAt: true, tzOffsetMin: true },
    }),
    prisma.sessionClassification.count({ where: { tzOffsetMin: null } }),
  ]);

  const buckets = new Array<number>(24).fill(0);
  for (const s of withTz) {
    buckets[localHourOf(s.startedAt, s.tzOffsetMin as number)]++;
  }
  const max = Math.max(...buckets);
  const peakHour = max > 0 ? buckets.indexOf(max) : null;
  return { buckets, peakHour, excludedNoTz: excluded };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @gabee/web test`
Expected: PASS.

- [ ] **Step 5: Render the histogram on the analytics page**

In `app/admin/analytics/page.tsx`, call `getHourlyUsage()` and add a section (a simple 24-bar CSS histogram; highlight the peak bucket; show `excludedNoTz` as "N sessions without timezone (pre-deploy)"). Follow the existing tile/table styling in that file. Include a bilingual label (`L ? 'Heure de pointe' : 'Peak hour'`).

- [ ] **Step 6: Typecheck + visual check**

Run: `pnpm --filter @gabee/web exec tsc --noEmit`
Then open `/admin/analytics` in the dev app and confirm the histogram renders (bars + peak-hour label + excluded count).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/server/services/hourly-usage.ts apps/web/src/lib/server/services/hourly-usage.test.ts apps/web/src/app/admin/analytics/page.tsx
git commit -m "feat(admin): hourly usage histogram + peak playing hour"
```

---

## Task 9: Admin devices panel

**Files:**
- Create: `apps/web/src/lib/server/services/admin-devices.ts`
- Create: `apps/web/src/app/admin/devices/page.tsx`
- Create: `apps/web/src/app/admin/devices/DevicesClient.tsx`
- Modify: admin nav (find the admin shell/nav component)

**Interfaces:**
- Consumes: `Device`/`DeviceIpSighting` (Task 2), `requireAdmin`/`requireSuperAdmin` (existing).
- Produces: `listDevices(): Promise<AdminDeviceRow[]>`, `getDeviceSightings(deviceId): Promise<AdminDeviceIpSighting[]>`.

- [ ] **Step 1: Implement `admin-devices.ts`**

```ts
import { prisma } from '../db';

export async function listDevices() {
  return prisma.device.findMany({
    orderBy: { lastSeen: 'desc' },
    take: 500,
    select: {
      id: true, deviceId: true, parentId: true, deviceLinkId: true,
      os: true, osVersion: true, browser: true, browserVersion: true,
      deviceType: true, deviceModel: true, screenW: true, screenH: true,
      tz: true, locale: true, appVersion: true, pwaStandalone: true,
      lastSeen: true, firstSeen: true,
      // NOTE: lastIp intentionally excluded from the default list (super-admin only).
      parent: { select: { email: true } },
    },
  });
}

/** Super-admin only — includes raw IPs. Caller MUST gate with requireSuperAdmin. */
export async function getDeviceSightings(deviceId: string) {
  return prisma.deviceIpSighting.findMany({
    where: { deviceId },
    orderBy: { seenAt: 'desc' },
    take: 200,
    select: { ip: true, uaFull: true, seenAt: true },
  });
}
```

- [ ] **Step 2: Build the page (server component) + client table**

`app/admin/devices/page.tsx`: `await requireAdmin(...)` via the existing admin page-guard pattern (mirror a sibling admin page, e.g. `app/admin/users/children/page.tsx`), call `listDevices()`, render `<DevicesClient rows={...} isSuperAdmin={...} />`. Determine `isSuperAdmin` from the session role (mirror how other admin pages read the role).

`DevicesClient.tsx`: a table of devices (OS/browser/type/screen/tz/app version/paired label/last seen). Each row expands (super-admin only) to fetch + show IP history via a small API route `GET /api/admin/devices/[deviceId]/sightings` guarded by `requireSuperAdmin`, calling `getDeviceSightings`. Follow existing admin table styling (`admin.css`).

- [ ] **Step 3: Add the sightings API route**

`app/api/admin/devices/[deviceId]/sightings/route.ts`:
```ts
import { route, json, requireSuperAdmin } from '@/lib/server/http';
import { getDeviceSightings } from '@/lib/server/services/admin-devices';

export const runtime = 'nodejs';

export const GET = route<{ params: Promise<{ deviceId: string }> }>(async (req, ctx) => {
  await requireSuperAdmin(req);
  const { deviceId } = await ctx.params;
  return json(await getDeviceSightings(deviceId));
});
```

- [ ] **Step 4: Add nav entry**

Add a "Devices"/"Appareils" link in the admin nav (find the shell component under `app/admin/_shell` or `layout.tsx`; mirror an existing entry).

- [ ] **Step 5: Typecheck + visual check**

Run: `pnpm --filter @gabee/web exec tsc --noEmit`
Open `/admin/devices` as an admin → table renders; as super-admin → IP history expands; as non-super-admin → the sightings route returns 403.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/server/services/admin-devices.ts apps/web/src/app/admin/devices apps/web/src/app/api/admin/devices
git commit -m "feat(admin): devices panel + super-admin IP history"
```

---

## Task 10: GDPR cascade + no-IP-in-logs verification

**Files:**
- Modify: GDPR deletion flow (find with grep)
- Review: the two `console.error` sites touched in Task 5

**Interfaces:**
- Consumes: cascade relations from Task 2 (`Device.parentId onDelete: Cascade`, `DeviceIpSighting.deviceId onDelete: Cascade`).

- [ ] **Step 1: Locate the deletion flow**

Run: `grep -rn "deleteMany\|onDelete\|gdpr\|eraseParent\|deleteParent\|deleteProfile" apps/web/src/lib/server/services`
Identify the parent/child deletion service used by `/admin/gdpr`.

- [ ] **Step 2: Confirm cascade covers the new tables**

`Device.parentId` cascades on ParentAccount delete, and `DeviceIpSighting.deviceId` cascades on Device delete (Task 2). If the GDPR flow deletes the `ParentAccount` row, both are removed automatically. If it instead soft-deletes or deletes children only, add explicit `prisma.device.deleteMany({ where: { parentId } })` (sightings cascade from Device) to the flow.

- [ ] **Step 3: Verify cascade against local DB**

Create a throwaway parent + device rows, delete the parent through the GDPR flow, then:
Run: `psql -d gabee -c "select count(*) from devices where parent_id = '<id>';" -c "select count(*) from device_ip_sightings where device_id in (select device_id from devices where parent_id = '<id>');"`
Expected: both counts 0 after deletion.

- [ ] **Step 4: Grep for accidental IP logging**

Run: `grep -rniE "console\.(log|error|warn).*(ip|lastIp|x-forwarded)" apps/web/src`
Expected: no match that logs an actual IP value. Fix any that do.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/services
git commit -m "chore(gdpr): ensure Device + IP sightings are erased with the account"
```

---

## Self-Review

**Spec coverage:**
- §3 decouple metadata/credential → Tasks 2, 5, 6. ✓
- §3 offline (snapshot on event sync) → Task 5, 7. ✓
- §4.1 Device table → Task 2; populated → Task 5, 7. ✓
- §4.2 DeviceIpSighting append-on-change → Task 5 (dedup step 6). ✓
- §4.3 session tz → Task 2 (cols) + Task 5 (write) + Task 7 (emit). ✓
- §4.4 DeviceLink.clientDeviceId → Task 2 + Task 6. ✓
- §5 shared types → Task 1. ✓
- §6 capture flow (client id, snapshot, server parse, IP, session tz, pairing join) → Tasks 5–7. ✓
- §6 UA parse server-side (ua-parser-js) → Task 3. ✓
- §6 app version via Vite → Task 7. ✓
- §7.1 devices panel → Task 9. ✓
- §7.2 hourly histogram + peak → Task 8. ✓
- §8 admin/super-admin gating → Tasks 8/9; no IP in logs → Tasks 5, 10; GDPR cascade → Task 10. ✓
- §9 additive migration, no backfill, "starts accumulating" note → Task 2, Task 8 (excludedNoTz). ✓
- §10 testing (types, UA, bucketing, X-Forwarded-For) → Tasks 1, 3, 4, 8. ✓
- BLOCKING privacy prereq → Global Constraints (release gate). ✓

**Placeholder scan:** No TBD/TODO; every code step shows code. Grep-to-locate steps (Tasks 1/6/9/10) are explicit discovery actions, not deferred work.

**Type consistency:** `DeviceSnapshot` fields (`device_id`, `ua_full`, `screen_w/h`, `dpr`, `tz`, `tz_offset_min`, `locale`, `app_version`, `pwa_standalone`) match across Tasks 1, 5, 7. `upsertDeviceFromSnapshot(parentId, snapshot, ip)` signature matches its Task-5 call. `localHourOf(date, offset)` / `getHourlyUsage()` consistent across Task 8. `getDeviceId()`/`buildDeviceSnapshot(locale)` consistent Tasks 6–7. Prisma field names (`deviceId`, `tzOffsetMin`, `lastIp`, `clientDeviceId`) consistent Tasks 2/5/6/8/9.

**Deferred (spec §2/§11):** geo resolution, bounded-retention, anti-abuse heuristics — intentionally not tasked.
