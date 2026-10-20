import { env, IS_PROD } from '../env';
import { HttpError } from '../http';
import { MemoryStorage } from './memory';
import { R2Storage } from './r2';
import type { StoragePort } from './port';

export type { StoragePort } from './port';
export { MemoryStorage } from './memory';

type StorageEnv = {
  STORAGE_DRIVER?: 'r2' | 'memory';
  MEDIA_R2_ACCOUNT_ID?: string;
  MEDIA_R2_ACCESS_KEY_ID?: string;
  MEDIA_R2_SECRET_ACCESS_KEY?: string;
  MEDIA_R2_BUCKET?: string;
};

const unavailable = () =>
  new HttpError(503, 'storage_unavailable', 'Media storage is not configured. Set the MEDIA_R2_* variables and retry.');

/** Pure driver choice (exported for tests). Memory storage is never allowed in production. */
export function selectStorage(e: StorageEnv, isProd: boolean): StoragePort {
  if (e.STORAGE_DRIVER === 'memory') {
    if (isProd) throw unavailable();
    return new MemoryStorage();
  }
  if (e.MEDIA_R2_ACCOUNT_ID && e.MEDIA_R2_ACCESS_KEY_ID && e.MEDIA_R2_SECRET_ACCESS_KEY && e.MEDIA_R2_BUCKET) {
    return new R2Storage({
      accountId: e.MEDIA_R2_ACCOUNT_ID,
      accessKeyId: e.MEDIA_R2_ACCESS_KEY_ID,
      secretAccessKey: e.MEDIA_R2_SECRET_ACCESS_KEY,
      bucket: e.MEDIA_R2_BUCKET,
    });
  }
  throw unavailable();
}

let cached: StoragePort | null = null;

export function getStorage(): StoragePort {
  if (!cached) cached = selectStorage(env, IS_PROD);
  return cached;
}

/** Test seam: replace the storage adapter. Pair with `resetStorage()`. */
export function setStorage(p: StoragePort): void {
  cached = p;
}

export function resetStorage(): void {
  cached = null;
}
