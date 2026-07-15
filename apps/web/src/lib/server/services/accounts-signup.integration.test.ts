import '../../../test/setup-integration'; // src/lib/server/services -> src/test (3 dirs up from services/)
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { signup } from './accounts';
import { HttpError } from '../http';

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
