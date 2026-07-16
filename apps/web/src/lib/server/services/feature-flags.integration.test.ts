import '../../../test/setup-integration'; // services -> server -> lib -> src, then test
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../test/factories';
import {
  getEffectiveFlagsForParent,
  listFlagsForAdmin,
  updateFlagDefault,
  listFlagOverrides,
  setFlagOverride,
  deleteFlagOverride,
} from './feature-flags';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('never-fetched with no DB rows → code fallbacks', async () => {
  const { parent } = await createLoginableParent(prisma);
  const flags = await getEffectiveFlagsForParent(parent.id);
  assert.equal(flags.kid_voiceover, true); // FLAG_FALLBACKS
  assert.equal(flags.kid_ambient_music, false);
});

test('enabledDefault overrides the code fallback', async () => {
  const { parent } = await createLoginableParent(prisma);
  await prisma.featureFlag.create({ data: { key: 'kid_ambient_music', enabledDefault: true } });
  const flags = await getEffectiveFlagsForParent(parent.id);
  assert.equal(flags.kid_ambient_music, true);
});

test('a parent override beats the default (including a false override)', async () => {
  const { parent } = await createLoginableParent(prisma);
  await prisma.featureFlag.create({ data: { key: 'kid_voiceover', enabledDefault: true } });
  await setFlagOverride('kid_voiceover', { email: parent.email, enabled: false });
  const flags = await getEffectiveFlagsForParent(parent.id);
  assert.equal(flags.kid_voiceover, false);
});

test('listFlagsForAdmin returns every registry key with override counts', async () => {
  const { parent } = await createLoginableParent(prisma);
  await setFlagOverride('kid_ambient_music', { email: parent.email, enabled: true });
  const { flags } = await listFlagsForAdmin();
  assert.deepEqual(flags.map((f) => f.key).sort(), ['kid_ambient_music', 'kid_voiceover']);
  const music = flags.find((f) => f.key === 'kid_ambient_music')!;
  assert.equal(music.override_count, 1);
});

test('updateFlagDefault upserts and is create-safe', async () => {
  await updateFlagDefault('kid_voiceover', { enabled_default: false, description: 'x' });
  const { flags } = await listFlagsForAdmin();
  const vo = flags.find((f) => f.key === 'kid_voiceover')!;
  assert.equal(vo.enabled_default, false);
  assert.equal(vo.description, 'x');
});

test('setFlagOverride is idempotent; listFlagOverrides carries the email; delete removes it', async () => {
  const { parent } = await createLoginableParent(prisma);
  await setFlagOverride('kid_voiceover', { email: parent.email, enabled: false });
  await setFlagOverride('kid_voiceover', { email: parent.email, enabled: true }); // update, not dup
  const { overrides } = await listFlagOverrides('kid_voiceover');
  assert.equal(overrides.length, 1);
  assert.equal(overrides[0]!.email, parent.email);
  assert.equal(overrides[0]!.enabled, true);
  await deleteFlagOverride('kid_voiceover', parent.email);
  assert.equal((await listFlagOverrides('kid_voiceover')).overrides.length, 0);
});

test('unknown email → 404; unknown flag key → 404', async () => {
  await assert.rejects(
    () => setFlagOverride('kid_voiceover', { email: 'nobody@x.com', enabled: true }),
    (e: unknown) => (e as { code?: string }).code === 'account_not_found',
  );
  const { parent } = await createLoginableParent(prisma);
  await assert.rejects(
    () => setFlagOverride('made_up_flag', { email: parent.email, enabled: true }),
    (e: unknown) => (e as { code?: string }).code === 'unknown_flag',
  );
});
