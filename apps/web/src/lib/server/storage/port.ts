/** Object storage seam: Cloudflare R2 in production, in-memory for tests and e2e. */
export interface StoragePort {
  /** Presigned PUT bound to the declared content type and size. */
  presignPut(key: string, mime: string, sizeBytes: number, ttlSec: number): Promise<string>;
  /** Presigned GET that downloads as `downloadName` (Content-Disposition: attachment). */
  presignGet(key: string, downloadName: string, ttlSec: number): Promise<string>;
  /** Object metadata, or null when the object does not exist. */
  head(key: string): Promise<{ sizeBytes: number; mime: string | null } | null>;
  /** First `bytes` bytes of the object. */
  readRange(key: string, bytes: number): Promise<Uint8Array>;
  /** Delete the object. Deleting a missing object is not an error. */
  delete(key: string): Promise<void>;
}

/** Content-Disposition value forcing a download under a readable, header-safe name. */
export function attachmentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
