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
