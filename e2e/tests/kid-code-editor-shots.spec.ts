// Visual-validation screenshot of the restyled coding editor (design pass).
// Uses the proven in-app navigation (code module → Parcours) from kid-session-code.
import { test, expect } from '@playwright/test';
import { seedKidAuthAndPickAva } from '../helpers/kid-session';

test('coding editor L1 — design pass screenshot', async ({ page }) => {
  await seedKidAuthAndPickAva(page); // lands on the hub
  await page.locator('button.module-tile[data-module="code"]').click();
  await page.getByRole('button', { name: /Parcours/ }).click(); // maze sub-hub → session
  const screen = page.locator('.session-screen').first();
  await expect(screen).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800); // let the board/bee settle
  await screen.screenshot({ path: 'screenshots/code-editor-l1.png' });
});
