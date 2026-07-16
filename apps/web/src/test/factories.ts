/**
 * Layer-3 test factories for auth/pairing integration suites (phase 3a).
 *
 * `createParent` from `@gabee/db/testing` makes a bare `ParentAccount` row —
 * no `ParentCredential`, no `emailConfirmedAt` — so it can never pass
 * `login()`. `createLoginableParent` seeds a real scrypt credential (via
 * `hashPassword`, the same function the signup route uses) plus email
 * confirmation, producing a parent that behaves exactly like one who signed
 * up and confirmed for real.
 *
 * `EmailConfirmation`/`PasswordReset` rows store ONLY `sha256(rawToken)` —
 * see `email-confirmation.ts`/`password-reset.ts` `hash()` — so a seeded row
 * is only usable by the consume services if the seeder hashes identically.
 * Confirmed byte-for-byte: both services do
 * `createHash('sha256').update(token).digest('hex')`; `sha256()` below
 * matches.
 */
import { randomBytes, createHash } from 'node:crypto';
import type { PrismaClient, Prisma } from '@gabee/db';
import { createParent } from '@gabee/db/testing';
import { hashPassword } from '@/lib/server/auth';

const DEFAULT_PASSWORD = 'test-Password-123';

/**
 * `@gabee/db` doesn't re-export the generated `AccountRole` enum or
 * `ParentAccount` model type (kept out of the barrel to avoid clashing with
 * `@gabee/types` enums — see `packages/db/src/index.ts`). Use the schema's
 * literal union directly and infer the row type from `createParent`'s
 * return value instead of importing a type that isn't exported.
 */
type AccountRole = 'parent' | 'admin' | 'super_admin';
type ParentAccountRow = Awaited<ReturnType<typeof createParent>>;

export async function createLoginableParent(
  prisma: PrismaClient,
  opts: { password?: string; role?: AccountRole; confirmed?: boolean; email?: string } = {},
): Promise<{ parent: ParentAccountRow; password: string }> {
  const password = opts.password ?? DEFAULT_PASSWORD;
  const { hash, salt } = await hashPassword(password);
  const overrides: Partial<Prisma.ParentAccountUncheckedCreateInput> = {
    ...(opts.email ? { email: opts.email } : {}),
    ...(opts.role ? { role: opts.role } : {}),
    emailConfirmedAt: opts.confirmed === false ? null : new Date(),
    credentials: { create: { hash, salt, algorithm: 'scrypt' } },
  };
  const parent = await createParent(prisma, overrides);
  return { parent, password };
}

function sha256(token: string): string {
  // MUST match email-confirmation.ts / password-reset.ts hash() exactly —
  // verified 2026-07-14 (Task 1 Step 2): both are
  // createHash('sha256').update(token).digest('hex').
  return createHash('sha256').update(token).digest('hex');
}

export async function seedEmailConfirmation(
  prisma: PrismaClient,
  parentId: string,
  opts: { expiresAt?: Date; consumedAt?: Date | null } = {},
): Promise<{ rawToken: string }> {
  const rawToken = randomBytes(32).toString('base64url');
  await prisma.emailConfirmation.create({
    data: {
      parentId,
      tokenHash: sha256(rawToken),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      consumedAt: opts.consumedAt ?? null,
    },
  });
  return { rawToken };
}

export async function seedPasswordReset(
  prisma: PrismaClient,
  parentId: string,
  opts: { expiresAt?: Date; consumedAt?: Date | null } = {},
): Promise<{ rawToken: string }> {
  const rawToken = randomBytes(32).toString('base64url');
  await prisma.passwordReset.create({
    data: {
      parentId,
      tokenHash: sha256(rawToken),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
      consumedAt: opts.consumedAt ?? null,
    },
  });
  return { rawToken };
}
