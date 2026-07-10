import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUa } from './ua';

test('parses iOS Safari', () => {
  const r = parseUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  assert.equal(r.os, 'iOS');
  assert.equal(r.deviceType, 'mobile');
  assert.equal(r.browser, 'Mobile Safari');
});

test('parses Android Chrome', () => {
  const r = parseUa('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');
  assert.equal(r.os, 'Android');
  // ua-parser-js v2 prefixes "Mobile" for browsers detected on mobile devices
  // (differs from the brief's "Chrome"; verified against actual library output).
  assert.equal(r.browser, 'Mobile Chrome');
  assert.equal(r.deviceType, 'mobile');
});

test('desktop has null deviceType from parser mapped to desktop', () => {
  const r = parseUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  assert.equal(r.deviceType, 'desktop');
});

test('empty UA is all-null but desktop', () => {
  const r = parseUa('');
  assert.equal(r.os, null);
  assert.equal(r.deviceType, 'desktop');
});
