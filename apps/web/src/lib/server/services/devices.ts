// Device pairing service (parent spec §9.4 / §10.4 / §12.3 P9).
//
// Lifecycle:
//   1. Parent app POSTs /api/devices/pair → `createPairToken` mints a one-shot
//      JWT (24h TTL, sub = pair-token row id), stores the row, returns the
//      `kids.gabee.app/?pair=<jwt>` deep-link + emails it.
//   2. Kid PWA reads `?pair=` on first launch and POSTs /api/pair/claim →
//      `claimPairToken` verifies the JWT, finds the row (unused, unexpired),
//      mints a long-lived (~180d) parent-bearer JWT in the SAME shape as a
//      normal session token, creates the DeviceLink row, marks the pair
//      token used, writes a `device_paired` activity entry on EACH of the
//      parent's kids (the feed is kid-scoped). Returns the bearer + parent.
//   3. Parent app DELETE /api/devices/[id] → `revokeDevice` flips `revokedAt`
//      and writes `device_revoked` activity rows. The kid app's bearer
//      becomes invalid via the next `requireParent` lookup once we choose to
//      gate on the device row (Phase 1 leaves the bearer alive until expiry
//      — spec §15 Q4; we still surface revocation in the UI immediately).
//
// All DB shaping lives here; routes are thin Zod-validated wrappers.

import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Prisma } from '@gabee/db';
import {
  DeviceLinkRowSchema,
  type DeviceLinkRow,
  type DevicesListResponse,
  type ClaimDevicePairResponse,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { AUTH_JWT_SECRET } from '../env';
import { sendDevicePairLink } from '../mailgun';

const secret = new TextEncoder().encode(AUTH_JWT_SECRET);

/** Pair-token JWT lives 24h (parent spec §13 — one-shot, copy-paste-safe window). */
const PAIR_TOKEN_TTL_SECONDS = 60 * 60 * 24;
/** Device-bound bearer the kid app keeps lives ~180 days (parent spec §13). */
const DEVICE_BEARER_TTL_SECONDS = 60 * 60 * 24 * 180;

/** Where the kid PWA is hosted. Same default the kid app's `api.ts` falls back to. */
const KID_APP_URL = process.env.NEXT_PUBLIC_KID_APP_URL ?? 'http://localhost:5173';

// ─── Listing & revocation ────────────────────────────────────────────────────

/** List this parent's active (non-revoked) device links, newest paired first. */
export async function listDevices(parentId: string): Promise<DevicesListResponse> {
  const rows = await prisma.deviceLink.findMany({
    where: { parentId, revokedAt: null },
    orderBy: { pairedAt: 'desc' },
  });
  const devices: DeviceLinkRow[] = rows.map((row) =>
    DeviceLinkRowSchema.parse({
      id: row.id,
      label: row.label,
      user_agent_hint: row.userAgentHint,
      paired_at: row.pairedAt.toISOString(),
      last_active_at: row.lastActiveAt ? row.lastActiveAt.toISOString() : null,
    }),
  );
  return { devices };
}

/**
 * Soft-revoke a device. Only the parent who paired it can. Writes one
 * `device_revoked` row per kid in the household so the family feed surfaces
 * it (the feed is kid-scoped, parent spec §9.3).
 */
export async function revokeDevice(parentId: string, deviceId: string): Promise<void> {
  const device = await prisma.deviceLink.findUnique({ where: { id: deviceId } });
  if (!device) throw new HttpError(404, 'device_not_found', 'Device not found');
  if (device.parentId !== parentId) {
    throw new HttpError(403, 'forbidden', 'You can only revoke your own devices');
  }
  if (device.revokedAt) return; // idempotent

  const kids = await prisma.childProfile.findMany({
    where: { parentId },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.deviceLink.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    }),
    ...kids.map((kid) =>
      prisma.familyActivityLog.create({
        data: {
          childId: kid.id,
          actorParentId: parentId,
          action: 'device_revoked',
          payload: {
            device_id: deviceId,
            label: device.label,
          } satisfies Prisma.InputJsonValue,
        },
      }),
    ),
  ]);
}

// ─── Pair-token mint (parent app) ────────────────────────────────────────────

export interface CreatePairTokenInput {
  parentId: string;
  /** Where the link is emailed; defaults to the parent's own email upstream. */
  targetEmail: string;
  /** Friendly device label ("Home computer"). */
  label: string;
}

export interface CreatePairTokenResult {
  pair_url: string;
  expires_at: string;
}

/**
 * Mint a one-shot pair JWT, persist the `DevicePairToken` row, email the
 * `kids.gabee.app/?pair=<jwt>` link. Returns `pair_url` so a dev without
 * Mailgun can copy it from the response.
 */
export async function createPairToken(
  input: CreatePairTokenInput,
): Promise<CreatePairTokenResult> {
  const parent = await prisma.parentAccount.findUnique({
    where: { id: input.parentId },
    select: { email: true, displayNameForKids: true },
  });
  if (!parent) throw new HttpError(404, 'parent_not_found', 'Parent not found');

  const rowId = randomUUID();
  const expiresAt = new Date(Date.now() + PAIR_TOKEN_TTL_SECONDS * 1000);

  // The JWT IS the token (its signature is what the claim endpoint verifies).
  // We also persist the raw JWT in `token` so we can index on it for direct
  // lookup; uniqueness is enforced by the schema. The label is carried in the
  // JWT because the `DevicePairToken` row doesn't have a label column (the
  // schema is owned by another agent; we extend via signed claim instead).
  const jwt = await new SignJWT({
    pairTokenId: rowId,
    kind: 'device_pair',
    label: input.label,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(rowId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    // A random jti makes two pair-tokens for the same parent distinct even if
    // mint timestamps collide.
    .setJti(randomBytes(16).toString('hex'))
    .sign(secret);

  await prisma.devicePairToken.create({
    data: {
      id: rowId,
      parentId: input.parentId,
      token: jwt,
      targetEmail: input.targetEmail,
      expiresAt,
    },
  });

  const pairUrl = `${KID_APP_URL}/?pair=${encodeURIComponent(jwt)}`;

  // Send the email; the mailgun helper no-ops in dev so this never blocks
  // the API response.
  const display =
    (parent.displayNameForKids || '').trim() ||
    parent.email.split('@')[0] ||
    parent.email;
  try {
    await sendDevicePairLink({
      target_email: input.targetEmail,
      parent_display: display,
      label: input.label,
      pair_url: pairUrl,
      expires_at: expiresAt.toISOString(),
    });
  } catch {
    // Logged inside the helper; intentionally swallow so the parent can still
    // copy the link from the response.
  }

  return { pair_url: pairUrl, expires_at: expiresAt.toISOString() };
}

// ─── Pair-token claim (kid PWA) ──────────────────────────────────────────────

export interface ClaimPairTokenInput {
  token: string;
  userAgentHint?: string;
}

interface PairTokenClaims {
  pairTokenId: string;
  label: string;
}

async function verifyPairTokenJwt(token: string): Promise<PairTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.kind !== 'device_pair') return null;
    if (typeof payload.pairTokenId !== 'string') return null;
    const label = typeof payload.label === 'string' ? payload.label : 'Family device';
    return { pairTokenId: payload.pairTokenId, label };
  } catch {
    return null;
  }
}

/** Mint a long-lived (~180d) parent-bearer JWT, same shape as `createSessionToken`. */
async function mintDeviceBearer(parentId: string, email: string): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + DEVICE_BEARER_TTL_SECONDS * 1000);
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(parentId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, expiresAt };
}

/**
 * Exchange a one-shot pair JWT for a long-lived device-bound parent JWT.
 * Refuses expired / used / signature-invalid tokens. Writes the DeviceLink,
 * marks the pair-token used, writes `device_paired` activity rows per kid.
 */
export async function claimPairToken(
  input: ClaimPairTokenInput,
): Promise<ClaimDevicePairResponse> {
  const claims = await verifyPairTokenJwt(input.token);
  if (!claims) throw new HttpError(400, 'invalid_token', 'Pair link is invalid');

  const row = await prisma.devicePairToken.findUnique({
    where: { id: claims.pairTokenId },
  });
  if (!row) throw new HttpError(404, 'pair_token_not_found', 'Pair link is invalid');
  if (row.usedAt) throw new HttpError(409, 'pair_token_used', 'Pair link has already been used');
  if (row.expiresAt.getTime() < Date.now()) {
    throw new HttpError(410, 'pair_token_expired', 'Pair link has expired');
  }

  // Belt-and-braces: the JWT and the stored token must match (the row's `token`
  // is the JWT itself; mismatch means a forged/replay attempt).
  if (row.token !== input.token) {
    throw new HttpError(400, 'invalid_token', 'Pair link is invalid');
  }

  const parent = await prisma.parentAccount.findUnique({
    where: { id: row.parentId },
    select: { id: true, email: true },
  });
  if (!parent) throw new HttpError(404, 'parent_not_found', 'Parent account no longer exists');

  const deviceId = randomUUID();
  const refreshTokenId = randomUUID();
  const now = new Date();
  const { token: bearer, expiresAt: bearerExpiry } = await mintDeviceBearer(
    parent.id,
    parent.email,
  );

  const kids = await prisma.childProfile.findMany({
    where: { parentId: parent.id },
    select: { id: true },
  });

  // Label was signed into the pair JWT at mint time (the parent picked it).
  const label = claims.label.trim() || 'Family device';

  await prisma.$transaction([
    prisma.deviceLink.create({
      data: {
        id: deviceId,
        parentId: parent.id,
        label,
        userAgentHint: input.userAgentHint ?? null,
        refreshTokenId,
        pairedAt: now,
        lastActiveAt: now,
      },
    }),
    prisma.devicePairToken.update({
      where: { id: row.id },
      data: { usedAt: now, resultingDeviceId: deviceId },
    }),
    ...kids.map((kid) =>
      prisma.familyActivityLog.create({
        data: {
          childId: kid.id,
          actorParentId: parent.id,
          action: 'device_paired',
          payload: {
            device_id: deviceId,
            label,
          } satisfies Prisma.InputJsonValue,
        },
      }),
    ),
  ]);

  return {
    token: bearer,
    expires_at: bearerExpiry.toISOString(),
    device_id: deviceId,
    parent: { id: parent.id, email: parent.email },
  };
}
