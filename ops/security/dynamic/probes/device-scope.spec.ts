import { test, expect, request as apiRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { login, TESTERS } from '../probe-lib';

/**
 * A paired kid device must NOT be a parent.
 *
 * These pin the fix for two findings the first sweep surfaced (see
 * docs/security/first-sweep-2026-07.md #5 and #7):
 *   - `mintDeviceBearer` used to sign the same claims as a parent session, so a kid
 *     tablet held full parent authority over the family for 180 days — it could read
 *     the parent's messages, list/revoke their devices, delete a child.
 *   - `revokeDevice` set `revokedAt` and returned 204, but nothing checked the bearer
 *     against the DeviceLink, so a lost tablet's token kept working until expiry.
 *
 * A regression in either is a block-tier finding, not a nit: the kid tablet is the
 * device most likely to be shared, lost, or handed around, and a child operates it.
 */

/**
 * Pair a fresh device and return its bearer + the parent's bearer + DeviceLink id.
 *
 * Each caller passes its own `bucketIp`: the login limiter is 5/5min per client IP,
 * and every test here logs in, so sharing one bucket with the other specs trips 429
 * and fails the suite for the wrong reason. The app buckets on the LAST
 * X-Forwarded-For hop, and nothing proxies the throwaway target, so this header IS
 * the bucket key.
 */
async function pairDevice(baseURL: string, bucketIp: string) {
  const ctx = await apiRequest.newContext({
    baseURL,
    extraHTTPHeaders: { 'x-forwarded-for': bucketIp },
  });
  const parentToken = await login(ctx, TESTERS.A.email, TESTERS.A.password);
  const pair = await ctx.post('/api/devices/pair', {
    headers: { authorization: `Bearer ${parentToken}` },
    data: { label: 'Probe tablet' },
  });
  expect(pair.status(), 'parent can mint a pair link').toBe(201);
  const pairUrl: string = (await pair.json()).pair_url;
  const pairJwt = decodeURIComponent(/[?&]pair=([^&]+)/.exec(pairUrl)![1]!);

  const claim = await ctx.post('/api/pair/claim', {
    data: { token: pairJwt, user_agent_hint: 'Probe tablet' },
  });
  expect(claim.status(), 'device can claim the pair link').toBe(200);
  const deviceToken: string = (await claim.json()).token;

  const list = await ctx.get('/api/devices', { headers: { authorization: `Bearer ${parentToken}` } });
  const deviceLinkId: string = (await list.json()).devices[0].id;
  return { ctx, parentToken, deviceToken, deviceLinkId };
}

const asDevice = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });

test('a kid device token is REJECTED on parent-only routes', async ({ request, baseURL }) => {
  const { ctx, deviceToken } = await pairDevice(baseURL!, '10.99.2.1');
  // Each of these returned 200 to a kid tablet before scoping shipped.
  for (const path of ['/api/messages', '/api/devices', '/api/family/activity']) {
    const r = await request.get(path, asDevice(deviceToken));
    expect(r.status(), `device token on ${path} must be forbidden`).toBe(403);
  }
  await ctx.dispose();
});

test('a kid device token still works on the endpoints the kid app needs', async ({ request, baseURL }) => {
  const { ctx, deviceToken } = await pairDevice(baseURL!, '10.99.2.2');
  for (const path of ['/api/profiles', '/api/bundles']) {
    const r = await request.get(path, asDevice(deviceToken));
    expect(r.status(), `kid app must still reach ${path}`).toBe(200);
  }
  await ctx.dispose();
});

test('a kid device may set audio_enabled but nothing else on a profile', async ({ request, baseURL }) => {
  const { ctx, deviceToken } = await pairDevice(baseURL!, '10.99.2.3');
  const profiles = await request.get('/api/profiles', asDevice(deviceToken));
  const kidId: string = (await profiles.json()).profiles[0].id;

  const ok = await request.patch(`/api/profiles/${kidId}`, {
    ...asDevice(deviceToken),
    data: { audio_enabled: false },
  });
  expect(ok.status(), 'the audio toggle is the one field the kid app writes').toBe(200);

  // Must be REJECTED, not silently dropped — a device probing for a wider write
  // should get an error, not a quiet no-op that looks like success.
  const denied = await request.patch(`/api/profiles/${kidId}`, {
    ...asDevice(deviceToken),
    data: { name: 'pwned' },
  });
  expect(denied.status(), 'device must not rewrite parent-owned profile fields').toBe(422);
  await ctx.dispose();
});

test('revoking a device invalidates its token immediately, and nothing it submits after counts', async ({ request, baseURL }) => {
  const { ctx, parentToken, deviceToken, deviceLinkId } = await pairDevice(baseURL!, '10.99.2.4');
  const profiles = await request.get('/api/profiles', asDevice(deviceToken));
  expect(profiles.status(), 'device works before revocation').toBe(200);
  const kidId: string = (await profiles.json()).profiles[0].id;

  const revoke = await ctx.delete(`/api/devices/${deviceLinkId}`, {
    headers: { authorization: `Bearer ${parentToken}` },
  });
  expect(revoke.status(), 'parent revokes the device').toBe(204);

  // The whole point: a lost tablet is actually cut off, not just hidden from the UI.
  const after = await request.get('/api/profiles', asDevice(deviceToken));
  expect(after.status(), 'revoked device token must stop working').toBe(401);

  // …and anything it tries to submit afterwards is refused, so a revoked device
  // cannot back-fill events or inflate progress.
  const events = await request.post('/api/events', { ...asDevice(deviceToken), data: { events: [] } });
  expect(events.status(), 'revoked device cannot submit events').toBe(401);

  const sync = await request.post('/api/progress/sync', {
    ...asDevice(deviceToken),
    data: { profile_id: kidId, updated_at: new Date(0).toISOString(), total_stars: 999999 },
  });
  expect(sync.status(), 'revoked device cannot sync progress').toBe(401);
  await ctx.dispose();
});
