import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRequestMeta } from './request-meta';

function req(h: Record<string, string>) {
  return { headers: new Headers(h) };
}

// Traefik APPENDS the real peer to any client-supplied X-Forwarded-For, so the
// LAST hop is the address it actually observed. Reading the first hop would let a
// caller pin any IP onto a device record / auth event by sending their own XFF.
test('takes last hop of x-forwarded-for (the hop Traefik appended)', () => {
  const m = getRequestMeta(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'X' }));
  assert.equal(m.ip, '10.0.0.1');
  assert.equal(m.ua, 'X');
});

test('a client-forged x-forwarded-for cannot spoof the recorded ip', () => {
  // Attacker sends "1.2.3.4"; Traefik appends the real peer 198.51.100.9.
  const m = getRequestMeta(req({ 'x-forwarded-for': '1.2.3.4, 198.51.100.9' }));
  assert.equal(m.ip, '198.51.100.9');
});

test('single-hop x-forwarded-for still works', () => {
  const m = getRequestMeta(req({ 'x-forwarded-for': '203.0.113.7' }));
  assert.equal(m.ip, '203.0.113.7');
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
