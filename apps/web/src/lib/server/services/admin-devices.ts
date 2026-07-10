import { prisma } from '../db';

/**
 * Task 9 — admin devices panel. `Device.lastIp` is intentionally excluded from
 * this listing: raw IP is super-admin-only and surfaced exclusively through
 * `getDeviceSightings` (drill-down), which the caller MUST gate with
 * `requireSuperAdmin`.
 */
export async function listDevices() {
  return prisma.device.findMany({
    orderBy: { lastSeen: 'desc' },
    take: 500,
    select: {
      id: true,
      deviceId: true,
      parentId: true,
      deviceLinkId: true,
      os: true,
      osVersion: true,
      browser: true,
      browserVersion: true,
      deviceType: true,
      deviceModel: true,
      screenW: true,
      screenH: true,
      tz: true,
      locale: true,
      appVersion: true,
      pwaStandalone: true,
      lastSeen: true,
      firstSeen: true,
      // NOTE: lastIp intentionally excluded from the default list (super-admin only).
      parent: { select: { email: true } },
    },
  });
}

export type AdminDeviceRow = Awaited<ReturnType<typeof listDevices>>[number];

/** Super-admin only — includes raw IPs. Caller MUST gate with requireSuperAdmin. */
export async function getDeviceSightings(deviceId: string) {
  return prisma.deviceIpSighting.findMany({
    where: { deviceId },
    orderBy: { seenAt: 'desc' },
    take: 200,
    select: { ip: true, uaFull: true, seenAt: true },
  });
}

export type AdminDeviceIpSighting = Awaited<ReturnType<typeof getDeviceSightings>>[number];
