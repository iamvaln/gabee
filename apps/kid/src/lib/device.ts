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

/** IANA zone, e.g. "Europe/Paris". */
export function deviceTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Minutes from UTC (e.g. +120 for CEST). */
export function deviceTzOffsetMin(): number {
  return -new Date().getTimezoneOffset();
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
    tz: deviceTz(),
    tz_offset_min: deviceTzOffsetMin(),
    locale,
    app_version: __APP_VERSION__,
    pwa_standalone: standalone,
  };
}
