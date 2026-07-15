import './setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createHash } from 'node:crypto';
import { login } from '@/lib/server/services/accounts';
import { createLoginableParent, seedEmailConfirmation, seedPasswordReset } from './factories';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('createLoginableParent produces a parent that login() accepts', async () => {
  const { parent, password } = await createLoginableParent(prisma);
  const logged = await login(parent.email, password); // real scrypt verify + confirmed gate
  assert.equal(logged.id, parent.id);
});

test('createLoginableParent({ confirmed: false }) is rejected by the confirmation gate', async () => {
  const { parent, password } = await createLoginableParent(prisma, { confirmed: false });
  // HttpError keeps the machine-readable code (`email_not_confirmed`) separate
  // from its human `message` ("Please confirm your email..."); assert.rejects
  // with a RegExp matches against `String(error)` ("Error: <message>"), which
  // never contains the code, so a plain regex here would false-negative.
  // Assert on `.code` directly instead.
  await assert.rejects(
    () => login(parent.email, password),
    (err: unknown) => err instanceof Error && (err as { code?: string }).code === 'email_not_confirmed',
  );
});

test('createLoginableParent({ role }) sets the account role', async () => {
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  const row = await prisma.parentAccount.findUniqueOrThrow({ where: { id: parent.id } });
  assert.equal(row.role, 'admin');
});

test('seedEmailConfirmation stores sha256 of the returned raw token', async () => {
  const { parent } = await createLoginableParent(prisma, { confirmed: false });
  const { rawToken } = await seedEmailConfirmation(prisma, parent.id);
  const row = await prisma.emailConfirmation.findFirstOrThrow({ where: { parentId: parent.id } });
  assert.equal(row.tokenHash, createHash('sha256').update(rawToken).digest('hex'));
  assert.equal(row.consumedAt, null);
});

test('seedPasswordReset stores sha256 of the returned raw token', async () => {
  const { parent } = await createLoginableParent(prisma);
  const { rawToken } = await seedPasswordReset(prisma, parent.id);
  const row = await prisma.passwordReset.findFirstOrThrow({ where: { parentId: parent.id } });
  assert.equal(row.tokenHash, createHash('sha256').update(rawToken).digest('hex'));
});
