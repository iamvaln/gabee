import { test, expect } from '@playwright/test';

test('parent login page renders (French)', async ({ page }) => {
  await page.goto('/parent/login');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await expect(page.locator('#pe')).toBeVisible(); // email input
});

test('admin login page renders (French)', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await expect(page.locator('#ae')).toBeVisible(); // admin email input
});
