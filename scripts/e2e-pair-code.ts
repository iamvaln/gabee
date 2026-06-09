#!/usr/bin/env tsx
/**
 * E2E exercise of the device-pairing flow (link + short-code paths).
 * Hits the local dev server at http://localhost:3000 — assumes it's running
 * and that the `parent.test@gabee.app` / `gabee-dev-1234` account is
 * email-confirmed (set up earlier in dev).
 *
 * Each scenario reports PASS / FAIL with a short reason; the script exits
 * non-zero if any check fails. Read-only against the prod schema except
 * for the rows it creates (DevicePairToken + DeviceLink + activity logs)
 * — those are the natural side-effects of the flow.
 *
 * Usage:
 *   pnpm exec tsx scripts/e2e-pair-code.ts
 */

// Import the client factory directly from the workspace package by path —
// the scripts dir isn't part of the pnpm workspace, so `@gabee/db` doesn't
// resolve. Same factory the rest of the app uses.
import { createPrismaClient } from '../packages/db/src/client';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const PARENT_EMAIL = 'parent.test@gabee.app';
const PARENT_PASSWORD = 'gabee-dev-1234';

const prisma = createPrismaClient();

interface Result { name: string; pass: boolean; note: string }
const results: Result[] = [];

function record(name: string, pass: boolean, note = '') {
  results.push({ name, pass, note });
  const tag = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}${note ? ` — ${note}` : ''}`);
}

async function req<T = unknown>(
  path: string,
  init?: RequestInit & { bearer?: string },
): Promise<{ status: number; body: T | null }> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (init?.bearer) headers.set('Authorization', `Bearer ${init.bearer}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: body as T };
}

async function login(email: string, password: string): Promise<string> {
  const { status, body } = await req<{ token: string; parent: { id: string } }>(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  if (status !== 200 || !body?.token) {
    throw new Error(`login failed status=${status}: ${JSON.stringify(body)}`);
  }
  return body.token;
}

async function main() {
  console.log(`\nGabee e2e — pair flow @ ${BASE}\n`);

  // ─── 0. Login parent A — needed for every subsequent call ────────────────
  const bearerA = await login(PARENT_EMAIL, PARENT_PASSWORD);
  record('Parent A login (parent.test@gabee.app)', !!bearerA);

  // ─── 1. Create a pair token WITHOUT target_email (code-only path) ────────
  const { status: createStatus, body: createBody } = await req<{
    pair_url: string;
    short_code: string;
    expires_at: string;
  }>('/api/devices/pair', {
    method: 'POST',
    bearer: bearerA,
    body: JSON.stringify({ label: 'E2E test laptop' }),
  });
  record(
    'POST /api/devices/pair (no email) → 201 with short_code + pair_url',
    createStatus === 201 && /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(createBody?.short_code ?? ''),
    createBody?.short_code,
  );
  const code = createBody?.short_code as string;
  const pairUrl = createBody?.pair_url as string;

  // DB sanity — row exists, parent_id matches, used_at null, short_code set
  const row = await prisma.devicePairToken.findFirst({
    where: { shortCode: code, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  record(
    'DevicePairToken row persisted (unused, short_code set)',
    !!row && row.parentId.length === 36 && !row.usedAt,
    row?.id,
  );

  // ─── 2. Bad format → 400 ─────────────────────────────────────────────────
  const tooShort = await req('/api/pair/claim-code', {
    method: 'POST', bearer: bearerA, body: JSON.stringify({ code: 'ABC' }),
  });
  // 400 or 422 are both acceptable — the project uses 422 for Zod rejections,
  // 400 for HttpError thrown post-parse; either way it's NOT a 500 and the
  // payload is rejected before any DB work.
  record(
    'Bad code (too short) → 4xx (rejected before DB)',
    tooShort.status === 400 || tooShort.status === 422,
    `status=${tooShort.status}`,
  );

  // ─── 3. Unknown code → 404 ───────────────────────────────────────────────
  const unknown = await req('/api/pair/claim-code', {
    method: 'POST', bearer: bearerA, body: JSON.stringify({ code: 'ZZZ-999' }),
  });
  record('Unknown code → 404', unknown.status === 404, `status=${unknown.status}`);

  // ─── 4. No bearer → 401 ──────────────────────────────────────────────────
  const noBearer = await req('/api/pair/claim-code', {
    method: 'POST', body: JSON.stringify({ code }),
  });
  record('Claim WITHOUT parent bearer → 401', noBearer.status === 401, `status=${noBearer.status}`);

  // ─── 5. Code normalisation: lowercase + missing dash → still claims ──────
  // First, register the no-dash variant. Lower-case it too so we exercise the
  // server-side normaliser end-to-end.
  const garbled = code.replace('-', '').toLowerCase();
  const happy = await req<{ token: string; device_id: string; parent: { id: string } }>(
    '/api/pair/claim-code',
    { method: 'POST', bearer: bearerA, body: JSON.stringify({ code: garbled }) },
  );
  record(
    'Claim happy path (code lower-cased, no dash, parent A bearer) → 200 + device_id',
    happy.status === 200 && !!happy.body?.token && !!happy.body?.device_id,
    happy.body?.device_id?.slice(0, 8),
  );

  // ─── 6. Row is consumed in DB ────────────────────────────────────────────
  const consumed = await prisma.devicePairToken.findUnique({ where: { id: row!.id } });
  record(
    'Pair token row marked used (used_at set, resulting_device_id set)',
    !!consumed?.usedAt && consumed?.resultingDeviceId === happy.body?.device_id,
  );

  // ─── 7. Double-claim same code → 404 (treated as unknown by normaliser) ──
  const replay = await req('/api/pair/claim-code', {
    method: 'POST', bearer: bearerA, body: JSON.stringify({ code }),
  });
  record('Re-claim consumed code → 404', replay.status === 404, `status=${replay.status}`);

  // ─── 8. DeviceLink row written ───────────────────────────────────────────
  const link = await prisma.deviceLink.findUnique({
    where: { id: happy.body!.device_id },
  });
  record(
    'DeviceLink row written (label = "E2E test laptop", revokedAt null)',
    !!link && link.label === 'E2E test laptop' && link.revokedAt === null,
    link?.id?.slice(0, 8),
  );

  // ─── 9. Activity log: `device_paired` for each kid, with via: short_code ─
  const activity = await prisma.familyActivityLog.findMany({
    where: {
      action: 'device_paired',
      actorParentId: row!.parentId,
      // Cast — Prisma JsonValue accessor in `where` is `path` API, simpler to
      // post-filter once we read.
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const viaShortCode = activity.filter((a) => {
    const p = a.payload as { device_id?: string; via?: string } | null;
    return p?.device_id === happy.body!.device_id && p?.via === 'short_code';
  });
  const kidCount = await prisma.childProfile.count({ where: { parentId: row!.parentId } });
  record(
    'Activity log: device_paired written per kid, via=short_code',
    viaShortCode.length === kidCount && kidCount > 0,
    `${viaShortCode.length}/${kidCount} kids`,
  );

  // ─── 10. Regression: the LINK path still works on a fresh token ──────────
  const linkCreate = await req<{ pair_url: string; short_code: string }>(
    '/api/devices/pair',
    {
      method: 'POST',
      bearer: bearerA,
      body: JSON.stringify({ label: 'E2E link laptop', target_email: PARENT_EMAIL }),
    },
  );
  const jwt = decodeURIComponent(new URL(linkCreate.body!.pair_url).searchParams.get('pair') ?? '');
  const linkClaim = await req<{ token: string; device_id: string }>(
    '/api/pair/claim',
    { method: 'POST', body: JSON.stringify({ token: jwt }) },
  );
  record(
    'Regression: link path POST /api/pair/claim → 200 + device_id',
    linkClaim.status === 200 && !!linkClaim.body?.token,
    linkClaim.body?.device_id?.slice(0, 8),
  );

  // ─── 11. Rate limit: 5 successful unknown-code calls, 6th 429 ────────────
  // Reset bucket isn't exposed; this is best-effort. The bucket is keyed on
  // pair.code.<parent_id> with limit=5/10min. We already used 2 calls in
  // steps 2+3 and 1 in step 7 → 3 burned. Three more bad calls should hit
  // 429 on the 3rd of them.
  const before = [];
  for (let i = 0; i < 3; i++) {
    const r = await req('/api/pair/claim-code', {
      method: 'POST', bearer: bearerA, body: JSON.stringify({ code: `ZZ${i}-99${i}` }),
    });
    before.push(r.status);
  }
  // The first two should be 404 (or one 429 if the bucket was tighter than
  // expected), the third should be 429.
  record(
    'Rate limit kicks in within 5–6 attempts in a 10-min window',
    before.includes(429),
    `statuses=${before.join(',')}`,
  );

  // ─── Cleanup the DeviceLinks we made so a re-run starts clean ────────────
  await prisma.deviceLink.deleteMany({
    where: { label: { in: ['E2E test laptop', 'E2E link laptop'] } },
  });

  // ─── Summary ─────────────────────────────────────────────────────────────
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`\n  ${pass} passed, ${fail} failed of ${results.length}\n`);
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error('e2e crashed:', e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
