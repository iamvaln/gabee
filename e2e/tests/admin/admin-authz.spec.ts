import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, seedPendingPublish } from '../../helpers/db';

async function loginPlainAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#ae').fill(FIXTURES.adminOnlyEmail);
  await page.locator('#ap').fill(FIXTURES.adminOnlyPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('a plain admin can reach requireAdmin surfaces (content matrix)', async ({ page }) => {
  await loginPlainAdmin(page);
  await page.goto('/admin/content');
  await expect(page.getByRole('heading', { name: 'Contenu' })).toBeVisible();
  await expect(page.locator('table.matrix')).toBeVisible();
});

test('a plain admin cannot publish (super-admin only) — read-only, no publish button', async ({ page }) => {
  // Give words a pending diff so the card would render a publish control for a super_admin.
  await seedPendingPublish('words', `authz-${Date.now()}`);

  await loginPlainAdmin(page);
  await page.goto('/admin/content/publish');

  // The plain admin sees the read-only badge, never a publish button.
  await expect(page.getByText('Lecture seule').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Publier v/ })).toHaveCount(0);
});

test('a plain admin cannot edit or disable a module (super-admin only controls absent)', async ({ page }) => {
  await loginPlainAdmin(page);
  await page.goto('/admin/modules/numbers');

  // The page renders for the admin, but the super-admin-only ModuleControls are gone.
  await expect(page.getByRole('button', { name: 'Désactiver' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Réactiver' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Éditer le module' })).toHaveCount(0);
});
