/**
 * Standalone DB-integration check for the 90-day raw-IP purge. Lives under
 * scripts/ (NOT src/) so the `pnpm test` runner — which only globs
 * `src/**\/*.test.ts` — never picks it up. Not part of CI.
 *
 * Proves: expired IPs are removed, in-window IPs are kept, second run no-ops.
 *
 * Run: pnpm --filter @gabee/web exec tsx scripts/verify-ip-retention.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load packages/db/.env BEFORE importing the db module (it validates
// DATABASE_URL at import time). Same pattern as the sibling verify scripts.
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
const { purgeExpiredDeviceIps, IP_RETENTION_DAYS } = await import(
  '../src/lib/server/services/device-ip-retention'
);

const DAY = 24 * 60 * 60 * 1000;
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log('  ok —', msg);
}

const tag = `verify-ip-retention-${Date.now()}`;
let parentId = '';
try {
  const parent = await prisma.parentAccount.create({
    data: { email: `${tag}@example.invalid`, role: 'parent' },
  });
  parentId = parent.id;

  const now = new Date();
  const expired = new Date(now.getTime() - (IP_RETENTION_DAYS + 5) * DAY);
  const inWindow = new Date(now.getTime() - 3 * DAY);

  // A — stale device: last seen past the cutoff, so its lastIp must be cleared
  //     and both of its (expired) sightings deleted.
  await prisma.device.create({
    data: { deviceId: `${tag}-stale`, parentId, uaFull: 'x', lastIp: '5.5.5.5', firstSeen: expired, lastSeen: expired },
  });
  await prisma.deviceIpSighting.createMany({
    data: [
      { deviceId: `${tag}-stale`, ip: '5.5.5.5', seenAt: expired },
      { deviceId: `${tag}-stale`, ip: '5.5.5.6', seenAt: expired },
    ],
  });

  // B — active device: last seen inside the window, so its lastIp must SURVIVE;
  //     only its one expired sighting is deleted.
  await prisma.device.create({
    data: { deviceId: `${tag}-active`, parentId, uaFull: 'x', lastIp: '9.9.9.9', firstSeen: expired, lastSeen: inWindow },
  });
  await prisma.deviceIpSighting.createMany({
    data: [
      { deviceId: `${tag}-active`, ip: '1.1.1.1', seenAt: expired },
      { deviceId: `${tag}-active`, ip: '9.9.9.9', seenAt: inWindow },
    ],
  });

  const summary = await purgeExpiredDeviceIps(now);
  console.log('summary:', JSON.stringify(summary));
  assert(summary.retention_days === 90, 'retention window is 90 days');

  const stale = await prisma.device.findUnique({ where: { deviceId: `${tag}-stale` } });
  const active = await prisma.device.findUnique({ where: { deviceId: `${tag}-active` } });
  const staleSightings = await prisma.deviceIpSighting.count({ where: { deviceId: `${tag}-stale` } });
  const activeSightings = await prisma.deviceIpSighting.findMany({ where: { deviceId: `${tag}-active` } });

  assert(stale?.lastIp === null, 'stale device lastIp cleared');
  assert(staleSightings === 0, 'expired sightings deleted (stale device)');
  assert(active?.lastIp === '9.9.9.9', 'ACTIVE device lastIp KEPT (inside window)');
  assert(
    activeSightings.length === 1 && activeSightings[0]!.ip === '9.9.9.9',
    'only the expired sighting deleted; the in-window one kept',
  );

  const second = await purgeExpiredDeviceIps(now);
  assert(
    second.sightings_deleted === 0 && second.last_ips_cleared === 0,
    'second run is a no-op (idempotent)',
  );

  console.log('PASS');
} finally {
  if (parentId) await prisma.parentAccount.delete({ where: { id: parentId } }).catch(() => {});
  await prisma.$disconnect();
}
