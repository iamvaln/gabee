import '../../../test/setup-integration'; // src/lib/server/services -> src/test (3 dirs up from services/)
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent, seedPasswordReset } from '../../../test/factories';
import { consumePasswordReset } from './password-reset';
import { login } from './accounts';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('consuming a reset retires the old credential and the new password logs in', async () => {
  const { parent, password: oldPassword } = await createLoginableParent(prisma);
  const { rawToken } = await seedPasswordReset(prisma, parent.id);

  await consumePasswordReset(rawToken, 'brand-new-password');

  await assert.rejects(
    () => login(parent.email, oldPassword),
    (e: unknown) => e instanceof HttpError && e.code === 'invalid_credentials', // old password dead
  );
  const logged = await login(parent.email, 'brand-new-password'); // new one works
  assert.equal(logged.id, parent.id);

  // exactly one active (non-retired) credential remains
  const active = await prisma.parentCredential.count({ where: { parentId: parent.id, retiredAt: null } });
  assert.equal(active, 1);
});

test('a reset token is single-use', async () => {
  const { parent } = await createLoginableParent(prisma);
  const { rawToken } = await seedPasswordReset(prisma, parent.id);
  await consumePasswordReset(rawToken, 'first-new-password');
  // Sequential replay hits the up-front lookup (row.consumedAt is now set), so
  // it surfaces as the same `invalid_or_expired_token` code as any other dead
  // token — the transaction's `token_already_consumed` path is the race-only
  // fallback for two concurrent consumes racing the same row (password-reset.ts).
  await assert.rejects(
    () => consumePasswordReset(rawToken, 'second-new-password'),
    (e: unknown) => e instanceof HttpError && e.code === 'invalid_or_expired_token',
  );
});

test('an expired reset token is refused', async () => {
  const { parent } = await createLoginableParent(prisma);
  const { rawToken } = await seedPasswordReset(prisma, parent.id, { expiresAt: new Date(Date.now() - 1000) });
  await assert.rejects(
    () => consumePasswordReset(rawToken, 'whatever-new-password'),
    (e: unknown) => e instanceof HttpError && e.code === 'invalid_or_expired_token',
  );
});
