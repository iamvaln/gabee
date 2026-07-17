// e2e/tests/kid-code-rollout.spec.ts
// Content rollout: the `code_l6` flag gates the L6 (Debugging) tile in the code
// maze level map. Default OFF → tile hidden; a per-parent override ON → tile shown.
// Mirrors kid-feature-flags.spec's DB-seed pattern; reaches the level map via SPA
// history (the profile is re-picked each launch and not persisted, so a full
// reload would drop it — a popstate nav keeps the in-memory profile).
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, prisma } from '../helpers/db';
import { seedKidAuthAndPickAva } from '../helpers/kid-session';

async function setCodeL6Override(enabled: boolean | null): Promise<void> {
  // FK-safe: the flag row must exist before an override references it.
  await prisma.featureFlag.upsert({
    where: { key: 'code_l6' },
    update: {},
    create: { key: 'code_l6', enabledDefault: false, description: 'Coding level 6 rollout gate' },
  });
  const parent = await prisma.parentAccount.findUnique({ where: { email: FIXTURES.parentEmail }, select: { id: true } });
  if (!parent) throw new Error('fixture parent missing');
  if (enabled === null) {
    await prisma.featureFlagOverride.deleteMany({ where: { flagKey: 'code_l6', parentId: parent.id } });
    return;
  }
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_parentId: { flagKey: 'code_l6', parentId: parent.id } },
    update: { enabled },
    create: { flagKey: 'code_l6', parentId: parent.id, enabled },
  });
}

/** SPA-navigate to the code maze level map without a reload (keeps the profile). */
async function gotoMazeLevels(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.history.pushState(null, '', '/learn/code/maze/levels');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.levelmap-screen[data-module="code"]')).toBeVisible({ timeout: 15_000 });
}

const l6Tile = (page: Page) => page.locator('.level-tile[aria-label="Débogage"]');
const tiles = (page: Page) => page.locator('.level-tile');

test('code_l6 OFF (default): the L6 Débogage tile is hidden', async ({ page }) => {
  await setCodeL6Override(null); // no override → code fallback / default OFF
  await seedKidAuthAndPickAva(page); // launch fetches effective flags (OFF)
  await gotoMazeLevels(page);
  await expect(l6Tile(page)).toHaveCount(0);
  // maze has L1–L7; with L6 gated off, six tiles show.
  await expect(tiles(page)).toHaveCount(6);
});

test('code_l6 ON (per-parent override): the L6 Débogage tile appears', async ({ page }) => {
  await setCodeL6Override(true);
  await seedKidAuthAndPickAva(page);
  // The level map reads flags imperatively, so wait until the launch fetch has
  // written code_l6=true into the persisted store before navigating.
  await expect
    .poll(async () => page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('gabee-kid-store') ?? '{}')?.state?.featureFlags?.code_l6 ?? null; }
      catch { return null; }
    }), { timeout: 10_000 })
    .toBe(true);
  await gotoMazeLevels(page);
  await expect(l6Tile(page)).toBeVisible();
  await expect(tiles(page)).toHaveCount(7);
});

test.afterAll(async () => { await setCodeL6Override(null); }); // leave the fixture clean
