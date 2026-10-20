import type { MediaAspect } from '@gabee/types';

const RATIOS: [MediaAspect, number][] = [
  ['16:9', 16 / 9],
  ['1:1', 1],
  ['9:16', 9 / 16],
  ['4:5', 4 / 5],
];

/** The supported aspect whose ratio is within 2% of w/h, else null. */
export function matchAspect(width: number, height: number): MediaAspect | null {
  if (!(width > 0) || !(height > 0)) return null;
  const r = width / height;
  for (const [name, target] of RATIOS) if (Math.abs(r - target) / target <= 0.02) return name;
  return null;
}

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) => u16be(b, i) * 65536 + u16be(b, i + 2);
const tag = (b: Uint8Array, i: number) => String.fromCharCode(b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0);

function ok(w: number, h: number): { width: number; height: number } | null {
  return w > 0 && h > 0 ? { width: w, height: h } : null;
}

function jpeg(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1]!;
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
      if (i + 9 > b.length) return null;
      return ok(u16be(b, i + 7), u16be(b, i + 5));
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): { width: number; height: number } | null {
  const t = tag(b, 12);
  if (t === 'VP8 ' && b.length >= 30) return ok(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  if (t === 'VP8L' && b.length >= 25) {
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) * 16777216);
    return ok((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (t === 'VP8X' && b.length >= 30) return ok(u24le(b, 24) + 1, u24le(b, 27) + 1);
  return null;
}

/** Pixel size from the header bytes of a png/jpeg/webp; null when not determinable. */
export function imageSize(b: Uint8Array, mime: string): { width: number; height: number } | null {
  if (mime === 'image/png') return b.length >= 24 ? ok(u32be(b, 16), u32be(b, 20)) : null;
  if (mime === 'image/jpeg') return jpeg(b);
  if (mime === 'image/webp') return webp(b);
  return null;
}
