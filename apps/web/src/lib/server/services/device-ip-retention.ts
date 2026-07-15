import { prisma } from '../db';

/**
 * Raw-IP retention (privacy — device-metadata design 2026-07-10).
 *
 * We collect a device's IP to protect accounts from misuse, but a child's IP
 * is directly-identifying data: keeping it forever is hard to justify under
 * GDPR-K storage-limitation. So raw IPs live for at most `IP_RETENTION_DAYS`,
 * then this purge removes them. Anti-abuse keeps a realistic investigation
 * window; the long tail of PII goes away.
 *
 * Two places hold a raw IP, so both are cleared:
 *  - `DeviceIpSighting.ip` — the append-only history. Rows older than the
 *    cutoff are deleted outright (without the IP the row carries nothing
 *    `Device.lastSeen` doesn't already say).
 *  - `Device.lastIp` — the latest IP. Cleared only for devices whose
 *    `lastSeen` is itself past the cutoff; an active device's `lastIp` is by
 *    definition inside the window.
 *
 * Idempotent: safe to run daily (or twice) — it only ever deletes rows that
 * are already past the cutoff.
 *
 * NOTE: never log an IP value from here — the summary carries counts only.
 */
export const IP_RETENTION_DAYS = 90;


export interface IpPurgeSummary {
  /** ISO cutoff — everything strictly older than this had its IP removed. */
  cutoff: string;
  retention_days: number;
  sightings_deleted: number;
  last_ips_cleared: number;
}

/** Delete expired raw IPs. `now` is injectable so the behaviour is testable. */
export async function purgeExpiredDeviceIps(now: Date = new Date()): Promise<IpPurgeSummary> {
  const cutoff = new Date(now.getTime() - IP_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [sightings, lastIps] = await Promise.all([
    prisma.deviceIpSighting.deleteMany({ where: { seenAt: { lt: cutoff } } }),
    prisma.device.updateMany({
      where: { lastSeen: { lt: cutoff }, lastIp: { not: null } },
      data: { lastIp: null },
    }),
  ]);

  return {
    cutoff: cutoff.toISOString(),
    retention_days: IP_RETENTION_DAYS,
    sightings_deleted: sightings.count,
    last_ips_cleared: lastIps.count,
  };
}
