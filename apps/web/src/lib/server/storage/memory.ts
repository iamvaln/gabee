import type { StoragePort } from './port';

/** In-memory storage for tests and e2e (`STORAGE_DRIVER=memory`). Never used in production. */
export class MemoryStorage implements StoragePort {
  private objects = new Map<string, { bytes: Uint8Array; mime: string }>();

  /** Test helper: simulate the browser's PUT. */
  putObject(key: string, bytes: Uint8Array, mime: string): void {
    this.objects.set(key, { bytes, mime });
  }

  async presignPut(key: string, mime: string, sizeBytes: number, ttlSec: number): Promise<string> {
    return `https://memory.test/put/${key}?mime=${encodeURIComponent(mime)}&size=${sizeBytes}&ttl=${ttlSec}`;
  }

  async presignGet(key: string, downloadName: string, ttlSec: number): Promise<string> {
    return `https://memory.test/get/${key}?name=${encodeURIComponent(downloadName)}&ttl=${ttlSec}`;
  }

  async head(key: string): Promise<{ sizeBytes: number; mime: string | null } | null> {
    const o = this.objects.get(key);
    return o ? { sizeBytes: o.bytes.length, mime: o.mime } : null;
  }

  async readRange(key: string, bytes: number): Promise<Uint8Array> {
    const o = this.objects.get(key);
    if (!o) throw new Error(`MemoryStorage: no object ${key}`);
    return o.bytes.slice(0, bytes);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
