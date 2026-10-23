import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSize, matchAspect } from './image-size';

const ascii = (s: string) => [...Buffer.from(s, 'latin1')];
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16le = (n: number) => [n & 255, (n >> 8) & 255];
const u24le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

test('imageSize reads png IHDR', () => {
  const b = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii('IHDR'), ...u32be(1600), ...u32be(900)]);
  assert.deepEqual(imageSize(b, 'image/png'), { width: 1600, height: 900 });
});

test('imageSize reads webp VP8, VP8L and VP8X', () => {
  const head = (fourcc: string) => [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(fourcc), 0, 0, 0, 0];
  const vp8 = Uint8Array.from([...head('VP8 '), 0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(640), ...u16le(480)]);
  assert.deepEqual(imageSize(vp8, 'image/webp'), { width: 640, height: 480 });
  const w = 1080 - 1, h = 1350 - 1;
  const bits = (w & 0x3fff) | ((h & 0x3fff) << 14);
  const vp8l = Uint8Array.from([...head('VP8L'), 0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255]);
  assert.deepEqual(imageSize(vp8l, 'image/webp'), { width: 1080, height: 1350 });
  const vp8x = Uint8Array.from([...head('VP8X'), 0, 0, 0, 0, ...u24le(1999), ...u24le(999)]);
  assert.deepEqual(imageSize(vp8x, 'image/webp'), { width: 2000, height: 1000 });
});

test('imageSize scans jpeg markers to SOF0/SOF2 and ignores truncated data', () => {
  const app0 = [0xff, 0xe0, 0, 6, 1, 2, 3, 4];
  const sof = (m: number) => [0xff, m, 0, 17, 8, ...[1350 >> 8, 1350 & 255], ...[1080 >> 8, 1080 & 255], 3];
  assert.deepEqual(imageSize(Uint8Array.from([0xff, 0xd8, ...app0, ...sof(0xc0)]), 'image/jpeg'), { width: 1080, height: 1350 });
  assert.deepEqual(imageSize(Uint8Array.from([0xff, 0xd8, ...app0, ...sof(0xc2)]), 'image/jpeg'), { width: 1080, height: 1350 });
  assert.equal(imageSize(Uint8Array.from([0xff, 0xd8, ...app0]), 'image/jpeg'), null);
  assert.equal(imageSize(Uint8Array.from([0x89, 0x50]), 'image/png'), null);
  assert.equal(imageSize(new Uint8Array(40), 'video/mp4'), null);
});

test('matchAspect maps within 2% to the four ratios, else null', () => {
  assert.equal(matchAspect(1920, 1080), '16:9');
  assert.equal(matchAspect(1000, 1000), '1:1');
  assert.equal(matchAspect(1080, 1920), '9:16');
  assert.equal(matchAspect(1080, 1350), '4:5');
  assert.equal(matchAspect(1500, 1000), null);
  assert.equal(matchAspect(0, 0), null);
});
