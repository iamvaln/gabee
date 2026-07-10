/**
 * Standalone DB-integration check for Task 9 (admin devices panel service
 * layer). Lives under scripts/ (NOT src/) so the `pnpm test` runner — which
 * only globs `src/**\/*.test.ts` — never picks it up. Not part of CI.
 *
 * Run: pnpm --filter @gabee/web exec tsx scripts/verify-admin-devices.mts
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
const { listDevices, getDeviceSightings } = await import(
  '../src/lib/server/services/admin-devices'
);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const testTag = `verify-admin-devices-${Date.now()}`;
  const email = `${testTag}@example.invalid`;
  const deviceId = randomUUID();

  const parent = await prisma.parentAccount.create({
    data: { email },
    select: { id: true },
  });
  const parentId = parent.id;

  try {
    const device = await prisma.device.create({
      data: {
        deviceId,
        parentId,
        uaFull: 'verify-ua-string',
        os: 'iOS',
        osVersion: '17.5',
        browser: 'Safari',
        browserVersion: '17.5',
        deviceType: 'mobile',
        screenW: 390,
        screenH: 844,
        tz: 'Europe/Paris',
        locale: 'fr',
        appVersion: '1.0.0',
        pwaStandalone: true,
        lastIp: '7.7.7.7',
      },
      select: { id: true },
    });

    await prisma.deviceIpSighting.createMany({
      data: [
        { deviceId, ip: '7.7.7.7', uaFull: 'verify-ua-string', seenAt: new Date(Date.now() - 60_000) },
        { deviceId, ip: '8.8.8.8', uaFull: 'verify-ua-string', seenAt: new Date() },
      ],
    });

    const devices = await listDevices();
    const found = devices.find((d) => d.deviceId === deviceId);
    assert(found, 'listDevices() should include the seeded device');
    assert(
      !('lastIp' in (found as Record<string, unknown>)),
      'listDevices() rows must NOT include lastIp (super-admin only)',
    );
    assert(found.parent.email === email, 'listDevices() should join parent.email');
    assert(found.os === 'iOS', 'listDevices() should return os');

    const sightings = await getDeviceSightings(deviceId);
    assert(sightings.length === 2, `Expected 2 sightings, got ${sightings.length}`);
    assert(
      sightings.every((s) => typeof s.ip === 'string' && s.ip.length > 0),
      'Every sighting should have an ip present',
    );
    assert(
      sightings[0]!.ip === '8.8.8.8',
      `Sightings should be ordered by seenAt desc, got first ip ${sightings[0]!.ip}`,
    );

    console.log('PASS');
    void device.id;
  } finally {
    // Cascade: ParentAccount -> Device (onDelete: Cascade) -> DeviceIpSighting
    // (onDelete: Cascade, keyed on Device.deviceId).
    await prisma.parentAccount.delete({ where: { id: parentId } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
