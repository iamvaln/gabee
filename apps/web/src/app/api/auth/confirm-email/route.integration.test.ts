import '../../../../test/setup-integration'; // src/app/api/auth/confirm-email -> src/test (4 dirs up)
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent, seedEmailConfirmation } from '../../../../test/factories';
import { webRequest } from '../../../../test/auth';
import { POST } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('a valid token confirms the account and is single-use', async () => {
  const { parent } = await createLoginableParent(prisma, { confirmed: false });
  const { rawToken } = await seedEmailConfirmation(prisma, parent.id);

  const res = await POST(
    webRequest('http://localhost/api/auth/confirm-email', { body: { token: rawToken } }),
    undefined,
  );
  assert.equal(res.status, 200);
  const confirmed = await prisma.parentAccount.findUniqueOrThrow({ where: { id: parent.id } });
  assert.notEqual(confirmed.emailConfirmedAt, null);

  // replay: same token again is refused, account stays confirmed
  const replay = await POST(
    webRequest('http://localhost/api/auth/confirm-email', { body: { token: rawToken } }),
    undefined,
  );
  assert.equal(replay.status, 400); // invalid_or_expired_token
});

test('an expired token is refused and does not confirm', async () => {
  const { parent } = await createLoginableParent(prisma, { confirmed: false });
  const { rawToken } = await seedEmailConfirmation(prisma, parent.id, {
    expiresAt: new Date(Date.now() - 1000),
  });

  const res = await POST(
    webRequest('http://localhost/api/auth/confirm-email', { body: { token: rawToken } }),
    undefined,
  );
  assert.ok(res.status >= 400);
  const row = await prisma.parentAccount.findUniqueOrThrow({ where: { id: parent.id } });
  assert.equal(row.emailConfirmedAt, null);
});

test('a garbage token is refused (400)', async () => {
  const res = await POST(
    webRequest('http://localhost/api/auth/confirm-email', { body: { token: 'x'.repeat(43) } }),
    undefined,
  );
  assert.ok(res.status >= 400);
});
