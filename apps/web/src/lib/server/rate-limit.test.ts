import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NextRequest } from 'next/server';

// `clientIpFrom` is pure header parsing, but it lives beside HttpError in a module
// whose import chain reaches env.ts, which validates the real runtime config at
// load. Stub the one required var and import dynamically so this stays a genuine
// unit test — runnable without a database, not just under CI's env block.
process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:5432/gabee_test';
const { clientIpFrom } = await import('./rate-limit');

function req(h: Record<string, string>) {
  return { headers: new Headers(h) } as unknown as NextRequest;
}

// The bucket key must be an address the CLIENT cannot choose. Traefik appends the
// real peer to any client-supplied X-Forwarded-For, so the last hop is the one it
// actually observed; reading the first hop let a caller pick their own bucket and
// rotate past every limiter (login, signup, password-reset, contact) at will.
test('buckets on the last x-forwarded-for hop (Traefik-observed peer)', () => {
  assert.equal(clientIpFrom(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '10.0.0.1');
});

test('a client-forged x-forwarded-for cannot pick the bucket', () => {
  // Attacker claims 1.2.3.4; Traefik appends the true peer. Rotating the forged
  // value must NOT change the bucket key.
  const a = clientIpFrom(req({ 'x-forwarded-for': '1.2.3.4, 198.51.100.9' }));
  const b = clientIpFrom(req({ 'x-forwarded-for': '9.9.9.9, 198.51.100.9' }));
  assert.equal(a, '198.51.100.9');
  assert.equal(b, '198.51.100.9');
  assert.equal(a, b, 'rotating the forged XFF prefix must not move the bucket');
});

test('single-hop x-forwarded-for still works', () => {
  assert.equal(clientIpFrom(req({ 'x-forwarded-for': '203.0.113.7' })), '203.0.113.7');
});

test('falls back to x-real-ip, then to a constant bucket', () => {
  assert.equal(clientIpFrom(req({ 'x-real-ip': '203.0.113.9' })), '203.0.113.9');
  // Header-less requests still get bucketed rather than going unlimited.
  assert.equal(clientIpFrom(req({})), 'unknown');
});

test('ignores empty/whitespace hops', () => {
  assert.equal(clientIpFrom(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, ' })), '10.0.0.1');
});
