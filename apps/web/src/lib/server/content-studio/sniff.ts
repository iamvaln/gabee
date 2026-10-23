export type SniffedMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4';

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** Identify an upload by its magic bytes — never trust the client-declared type. */
export function sniffMime(head: Uint8Array): SniffedMime | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) return 'video/mp4';
  return null;
}
