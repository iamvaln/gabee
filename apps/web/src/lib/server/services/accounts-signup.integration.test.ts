import '../../../test/setup-integration'; // src/lib/server/services -> src/test (3 dirs up from services/)
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { signup, login } from './accounts';
import { HttpError } from '../http';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('signup creates the account + one scrypt credential, unconfirmed', async () => {
  const parent = await signup('New.Person@Example.com', 'a-good-password');
  const row = await prisma.parentAccount.findUniqueOrThrow({
    where: { id: parent.id },
    include: { credentials: true },
  });
  assert.equal(row.email, 'new.person@example.com'); // normalized: trim + lowercase
  assert.equal(row.emailConfirmedAt, null);
  assert.equal(row.credentials.length, 1);
  assert.equal(row.credentials[0]!.algorithm, 'scrypt');
  assert.notEqual(row.credentials[0]!.hash, 'a-good-password'); // stored hashed, never plaintext

  // Round-trip proof: the stored hash is a real scrypt hash OF THIS PASSWORD,
  // not just "not plaintext". login() only reaches the email_not_confirmed
  // gate AFTER verifyPassword succeeds — a broken hash would yield
  // invalid_credentials instead.
  await assert.rejects(
    () => login('New.Person@Example.com', 'a-good-password'),
    (e: unknown) => e instanceof HttpError && e.code === 'email_not_confirmed',
  );
});

test('signup records terms consent atomically with the account', async () => {
  // The route enforces `terms_accepted: z.literal(true)`; the service then creates
  // the account AND its ConsentRecord in one transaction — no account exists
  // without proof of consent. Pin both the atomicity and the server-stamped version.
  const parent = await signup('consenter@example.com', 'a-good-password');

  const consents = await prisma.consentRecord.findMany({ where: { parentId: parent.id } });
  assert.equal(consents.length, 1, 'exactly one consent row is written at signup');
  assert.equal(consents[0]!.type, 'terms');
  assert.equal(consents[0]!.version, CURRENT_TERMS_VERSION); // server-authoritative, not client-sent
});

test('signup on an existing email is rejected (409 email_taken)', async () => {
  await signup('dupe@example.com', 'a-good-password');
  await assert.rejects(
    () => signup('dupe@example.com', 'another-password'),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'email_taken',
  );
});

// NOTE: no disposable-email case here. `isDisposableEmail` is only called
// from the signup ROUTE handler (apps/web/src/app/api/auth/signup/route.ts),
// not from the `signup()` service under test in this file — so a
// mailinator.com signup would succeed at this layer. That guard belongs in a
// route-level test, not here.
