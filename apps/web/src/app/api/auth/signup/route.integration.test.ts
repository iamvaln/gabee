import '../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { webRequest } from '../../../../test/auth';
import { POST } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const url = 'http://localhost/api/auth/signup';
const base = { password: 'a-good-password1', terms_accepted: true };
const DRAFT = '4b1f0c1e-7a52-4a61-9c4e-0d8f5d9c2b11';

test('POST /api/auth/signup persists the attribution on the parent account', async () => {
  const res = await POST(
    webRequest(url, {
      body: {
        ...base,
        email: 'attr-route@example.com',
        attribution: {
          utm: { source: 'linkedin', medium: 'social', campaign: 'w-2026-10-27', content: DRAFT },
        },
      },
    }),
    undefined,
  );
  assert.equal(res.status, 201);
  const row = await prisma.parentAccount.findUniqueOrThrow({ where: { email: 'attr-route@example.com' } });
  assert.deepEqual(row.signupSource, {
    source: 'linkedin',
    medium: 'social',
    campaign: 'w-2026-10-27',
    content: DRAFT,
  });
});

test('POST /api/auth/signup without attribution leaves signupSource empty', async () => {
  const res = await POST(webRequest(url, { body: { ...base, email: 'noattr-route@example.com' } }), undefined);
  assert.equal(res.status, 201);
  const row = await prisma.parentAccount.findUniqueOrThrow({ where: { email: 'noattr-route@example.com' } });
  assert.equal(row.signupSource, null);
});

test('POST /api/auth/signup rejects an oversized utm value (121 chars) with 422', async () => {
  const res = await POST(
    webRequest(url, {
      body: { ...base, email: 'big-utm@example.com', attribution: { utm: { source: 'x'.repeat(121) } } },
    }),
    undefined,
  );
  assert.equal(res.status, 422);
  assert.equal(await prisma.parentAccount.count(), 0);
});

test('POST /api/auth/signup rejects an oversized referrer_host with 422', async () => {
  const res = await POST(
    webRequest(url, {
      body: { ...base, email: 'big-ref@example.com', attribution: { utm: {}, referrer_host: 'h'.repeat(254) } },
    }),
    undefined,
  );
  assert.equal(res.status, 422);
});
