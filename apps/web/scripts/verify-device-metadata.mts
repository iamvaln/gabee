/**
 * Standalone DB-integration check for Task 5 (device upsert + tz on session
 * ingest). Lives under scripts/ (NOT src/) so the `pnpm test` runner — which
 * only globs `src/**\/*.test.ts` — never picks it up. Not part of CI.
 *
 * Run: pnpm --filter @gabee/web exec tsx scripts/verify-device-metadata.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Load packages/db/.env BEFORE importing the db module (it validates
// DATABASE_URL at import time). apps/web has no .env of its own in dev; the
// local Postgres connection string lives in packages/db/.env.
function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, '..', '..', '..', 'packages', 'db', '.env'));

const { prisma } = await import('../src/lib/server/db');
const { ingestEvents } = await import('../src/lib/server/services/events');
const { upsertDeviceFromSnapshot } = await import('../src/lib/server/services/devices-metadata');
const { DeviceSnapshotSchema } = await import('@gabee/types');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const testTag = `verify-device-metadata-${Date.now()}`;
  const email = `${testTag}@example.invalid`;

  const parent = await prisma.parentAccount.create({
    data: { email },
    select: { id: true },
  });
  const parentId = parent.id;
  let parentBId: string | null = null;

  try {
    const profile = await prisma.childProfile.create({
      data: {
        parentId,
        name: 'Verify Kid',
        language: 'en',
      },
      select: { id: true },
    });
    const profileId = profile.id;

    const deviceId = randomUUID();
    const sessionId = randomUUID();
    const iosUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

    // A non-revoked DeviceLink carrying this device's client_device_id — the
    // pairing credential Task 6 stamps at claim time. `upsertDeviceFromSnapshot`
    // should join `Device.deviceLinkId` to this row's id (Task 5).
    const deviceLink = await prisma.deviceLink.create({
      data: {
        parentId,
        label: 'Verify Kid device',
        clientDeviceId: deviceId,
        refreshTokenId: randomUUID(),
      },
      select: { id: true },
    });

    const snapshot = DeviceSnapshotSchema.parse({
      device_id: deviceId,
      ua_full: iosUa,
      screen_w: 390,
      screen_h: 844,
      dpr: 3,
      tz: 'Europe/Paris',
      tz_offset_min: 120,
      locale: 'fr',
      app_version: '1.0.0',
      pwa_standalone: true,
    });

    const sessionStartEnv = {
      event_id: randomUUID(),
      profile_id: profileId,
      session_id: sessionId,
      client_ts: new Date().toISOString(),
      schema_version: 1,
      event: {
        name: 'session_start' as const,
        initiation_label: null,
        tz: 'Europe/Paris',
        tz_offset_min: 120,
      },
    };

    // 1st sync — new device, new IP.
    await ingestEvents(parentId, [sessionStartEnv], { device: snapshot, ip: '203.0.113.5' });

    const device = await prisma.device.findUnique({ where: { deviceId } });
    assert(device, 'Device row should exist after ingest');
    assert(device.os !== null, 'Device.os should be parsed (non-null) for an iOS UA');
    assert(device.browser !== null, 'Device.browser should be parsed (non-null)');
    assert(device.parentId === parentId, 'Device.parentId should match the ingesting parent');
    assert(device.lastIp === '203.0.113.5', 'Device.lastIp should be the request ip');
    assert(
      device.deviceLinkId === deviceLink.id,
      `Device.deviceLinkId should join to the non-revoked DeviceLink carrying this client_device_id, got ${device.deviceLinkId}`,
    );

    const classification = await prisma.sessionClassification.findUnique({
      where: { sessionId },
    });
    assert(classification, 'SessionClassification row should exist for the session_start event');
    assert(
      classification.tz === 'Europe/Paris',
      `SessionClassification.tz should be 'Europe/Paris', got ${classification.tz}`,
    );
    assert(
      classification.tzOffsetMin === 120,
      `SessionClassification.tzOffsetMin should be 120, got ${classification.tzOffsetMin}`,
    );

    let sightings = await prisma.deviceIpSighting.findMany({ where: { deviceId } });
    assert(sightings.length === 1, `Expected exactly 1 DeviceIpSighting, got ${sightings.length}`);

    // 2nd sync — SAME ip → dedup, still 1 sighting.
    const sessionStartEnv2 = {
      ...sessionStartEnv,
      event_id: randomUUID(),
      client_ts: new Date().toISOString(),
    };
    await ingestEvents(parentId, [sessionStartEnv2], { device: snapshot, ip: '203.0.113.5' });
    sightings = await prisma.deviceIpSighting.findMany({ where: { deviceId } });
    assert(
      sightings.length === 1,
      `Expected sighting count to stay 1 after same-ip resync, got ${sightings.length}`,
    );

    // 3rd sync — NEW ip → 2nd sighting appended.
    const sessionStartEnv3 = {
      ...sessionStartEnv,
      event_id: randomUUID(),
      client_ts: new Date().toISOString(),
    };
    await ingestEvents(parentId, [sessionStartEnv3], { device: snapshot, ip: '198.51.100.9' });
    sightings = await prisma.deviceIpSighting.findMany({ where: { deviceId } });
    assert(
      sightings.length === 2,
      `Expected 2 sightings after a new ip, got ${sightings.length}`,
    );

    // Direct call sanity check on upsertDeviceFromSnapshot with a null ip (must not throw).
    await upsertDeviceFromSnapshot(parentId, snapshot, null);
    const deviceAfterNullIp = await prisma.device.findUnique({ where: { deviceId } });
    assert(
      deviceAfterNullIp?.lastIp === '198.51.100.9',
      'A null ip upsert should not clobber the previously stored lastIp',
    );

    // Cross-parent takeover guard: a SECOND parent presenting the same device_id
    // must NOT reassign the Device row or inherit its IP-sighting history.
    const parentB = await prisma.parentAccount.create({
      data: { email: `${testTag}-b@example.invalid` },
      select: { id: true },
    });
    parentBId = parentB.id;
    await prisma.childProfile.create({
      data: { parentId: parentBId, name: 'Verify Kid B', language: 'en' },
    });

    const sightingsBefore = await prisma.deviceIpSighting.count({ where: { deviceId } });
    await upsertDeviceFromSnapshot(parentBId, snapshot, '9.9.9.9');
    const deviceAfterTakeover = await prisma.device.findUnique({ where: { deviceId } });
    assert(
      deviceAfterTakeover?.parentId === parentId,
      `Device.parentId should stay parentA after a foreign upsert, got ${deviceAfterTakeover?.parentId}`,
    );
    assert(
      deviceAfterTakeover?.lastIp === '198.51.100.9',
      'Device.lastIp must not be overwritten by the foreign parent',
    );
    const sightingsAfter = await prisma.deviceIpSighting.count({ where: { deviceId } });
    assert(
      sightingsAfter === sightingsBefore,
      `Sighting count must be unchanged by a foreign upsert (was ${sightingsBefore}, now ${sightingsAfter})`,
    );

    console.log('PASS');
  } finally {
    // Cascades: Device (parentId FK) -> DeviceIpSighting, ChildProfile (parentId FK)
    // -> Event/SessionClassification, all onDelete: Cascade in schema.prisma.
    await prisma.parentAccount.delete({ where: { id: parentId } });
    if (parentBId) await prisma.parentAccount.delete({ where: { id: parentBId } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
