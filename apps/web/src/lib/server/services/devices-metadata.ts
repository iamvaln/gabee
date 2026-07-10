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

  // `deviceId` is globally unique. If this device_id is already owned by a
  // DIFFERENT parent, a blind upsert would silently reassign the row and its
  // IP-sighting history to the new parent — a cross-tenant leak. Metadata
  // capture is best-effort, so bail out entirely (no upsert, no sighting).
  if (existing && existing.parentId !== parentId) {
    console.warn('[devices] snapshot device_id owned by another parent; skipping');
    return;
  }

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
