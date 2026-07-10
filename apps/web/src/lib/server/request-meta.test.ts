import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRequestMeta } from './request-meta';

function req(h: Record<string, string>) {
  return { headers: new Headers(h) };
}

test('takes first hop of x-forwarded-for', () => {
  const m = getRequestMeta(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'X' }));
  assert.equal(m.ip, '203.0.113.7');
  assert.equal(m.ua, 'X');
});

test('falls back to x-real-ip', () => {
  const m = getRequestMeta(req({ 'x-real-ip': '203.0.113.9' }));
  assert.equal(m.ip, '203.0.113.9');
});

test('null when no ip headers', () => {
  const m = getRequestMeta(req({}));
  assert.equal(m.ip, null);
  assert.equal(m.ua, null);
});
