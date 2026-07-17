import '../../../../test/setup-integration'; // effective -> flags -> api -> app -> src, then test
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../../test/factories';
import { parentToken, webRequest } from '../../../../test/auth';
import { GET } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const url = 'http://localhost/api/flags/effective';

test('no bearer → 401', async () => {
  const res = await GET(webRequest(url, { method: 'GET' }), undefined);
  assert.equal(res.status, 401);
});

test('paired parent → effective flags (code fallbacks with no DB rows)', async () => {
  const { parent } = await createLoginableParent(prisma);
  const token = await parentToken(parent.id, parent.email);
  const res = await GET(webRequest(url, { method: 'GET', bearer: token }), undefined);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.flags.kid_voiceover, true);
  assert.equal(body.flags.kid_ambient_music, false);
});
