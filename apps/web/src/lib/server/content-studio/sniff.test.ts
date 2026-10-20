import test from 'node:test';
import assert from 'node:assert/strict';
import { sniffMime } from './sniff';

const bytes = (...b: number[]) => Uint8Array.from(b);
const ascii = (s: string) => Uint8Array.from(Buffer.from(s, 'latin1'));

test('sniffMime recognises png/jpeg/webp/mp4 and rejects html', () => {
  assert.equal(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0)), 'image/png');
  assert.equal(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)), 'image/jpeg');
  assert.equal(sniffMime(Uint8Array.from([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')])), 'image/webp');
  assert.equal(sniffMime(Uint8Array.from([0, 0, 0, 0x18, ...ascii('ftypmp42')])), 'video/mp4');
  assert.equal(sniffMime(ascii('<!DOCTYPE html><html>')), null);
  assert.equal(sniffMime(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(sniffMime(bytes()), null);
  assert.equal(sniffMime(Uint8Array.from([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')])), null);
});
