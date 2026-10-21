import test from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_MAX_IMAGE_BYTES, MEDIA_MAX_VIDEO_BYTES } from '@gabee/types';
import { checkFile, fileSize, parseTags, pickerFilter, tagsError, uploadMime } from './media';

/** A File of `size` bytes without allocating it (only `size` is read by the checks). */
function file(name: string, type: string, size = 1024): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

test('uploadMime trusts an allowed browser type, else the extension when the type is empty', () => {
  assert.equal(uploadMime(file('a.png', 'image/png')), 'image/png');
  assert.equal(uploadMime(file('clip.MP4', '')), 'video/mp4');
  assert.equal(uploadMime(file('photo.jpeg', '')), 'image/jpeg');
  assert.equal(uploadMime(file('logo.svg', 'image/svg+xml')), null);
  // A declared type wins over a misleading extension.
  assert.equal(uploadMime(file('page.png', 'text/html')), null);
  assert.equal(uploadMime(file('notes.txt', '')), null);
});

test('checkFile refuses other types, empty files and files over the caps, in French', () => {
  assert.equal(checkFile(file('a.webp', 'image/webp'), 'fr'), null);
  assert.match(checkFile(file('logo.svg', 'image/svg+xml'), 'fr') ?? '', /n’est pas accepté/);
  assert.match(checkFile(file('big.png', 'image/png', MEDIA_MAX_IMAGE_BYTES + 1), 'fr') ?? '', /trop lourd .* une image fait au plus 15 Mo/);
  assert.equal(checkFile(file('ok.mp4', 'video/mp4', MEDIA_MAX_IMAGE_BYTES + 1), 'fr'), null, 'a video may exceed the image cap');
  assert.match(checkFile(file('big.mp4', 'video/mp4', MEDIA_MAX_VIDEO_BYTES + 1), 'en') ?? '', /too large .* at most 300 MB/);
  assert.match(checkFile(file('empty.png', 'image/png', 0), 'fr') ?? '', /vide/);
});

test('parseTags matches the server normal form', () => {
  assert.deepEqual(parseTags(' Lecture, #Code;code\nNiveau 2,, '), ['lecture', 'code', 'niveau 2']);
  assert.equal(tagsError(parseTags('a,b'), 'fr'), null);
  assert.match(tagsError(parseTags(Array.from({ length: 11 }, (_, i) => `t${i}`).join(',')), 'fr') ?? '', /10 mots-clés au plus/);
  assert.match(tagsError(['x'.repeat(41)], 'en') ?? '', /40 characters/);
});

test('pickerFilter: TikTok takes vertical videos, LinkedIn any file', () => {
  assert.deepEqual(pickerFilter('tiktok'), { kind: 'video', aspect: '9:16' });
  assert.deepEqual(pickerFilter('linkedin'), {});
});

test('fileSize reads like a file manager', () => {
  assert.equal(fileSize(15 * 1024 * 1024, 'fr'), '15 Mo');
  assert.equal(fileSize(4.2 * 1024 * 1024, 'en'), '4.2 MB');
  assert.equal(fileSize(300, 'fr'), '1 Ko');
});
