// Visual-validation screenshots of the coding editor (design pass). Desktop-first.
// Uses the proven in-app navigation (code module → world → session).
import { test, expect } from '@playwright/test';
import { seedKidAuthAndPickAva } from '../helpers/kid-session';

test.use({ viewport: { width: 1280, height: 900 } });

test('coding editor — desktop screenshot', async ({ page }) => {
  await seedKidAuthAndPickAva(page); // lands on the hub
  await page.locator('button.module-tile[data-module="code"]').click();

  // Code sub-hub: enter the maze world's first lesson (session screen).
  await page.getByRole('button', { name: /Parcours/ }).click();
  const screen = page.locator('.session-screen').first();
  await expect(screen).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(900); // let the board/bee settle
  await page.screenshot({ path: 'screenshots/code-editor-maze-l1.png', fullPage: true });

  // Mobile collapse — the two zones should stack (board on top, workbench below).
  await page.setViewportSize({ width: 420, height: 900 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/code-editor-maze-l1-mobile.png', fullPage: true });
});
