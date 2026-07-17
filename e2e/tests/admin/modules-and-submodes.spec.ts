import { test, expect, type Page } from '@playwright/test';
import { prisma, FIXTURES, pollUntil } from '../../helpers/db';

async function loginSuperAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#ae').fill(FIXTURES.adminEmail);
  await page.locator('#ap').fill(FIXTURES.adminPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

const SUB_MODE_ID = 'numbers.etesting';

test.beforeEach(async () => {
  // Retry-safe preconditions: numbers active, the e2e sub-mode absent.
  await prisma.moduleDef.update({ where: { id: 'numbers' }, data: { status: 'active' } });
  await prisma.subMode.deleteMany({ where: { id: SUB_MODE_ID } });
});

test('super_admin disables then re-enables a module', async ({ page }) => {
  await loginSuperAdmin(page);
  await page.goto('/admin/modules/numbers');

  await page.getByRole('button', { name: 'Désactiver' }).click();
  await pollUntil(
    () => prisma.moduleDef.findUniqueOrThrow({ where: { id: 'numbers' } }),
    (m) => m.status === 'disabled',
  );
  await expect(page.getByRole('button', { name: 'Réactiver' })).toBeVisible();

  await page.getByRole('button', { name: 'Réactiver' }).click();
  await pollUntil(
    () => prisma.moduleDef.findUniqueOrThrow({ where: { id: 'numbers' } }),
    (m) => m.status === 'active',
  );
  await expect(page.getByRole('button', { name: 'Désactiver' })).toBeVisible();
});

test('super_admin creates then deletes a sub-mode', async ({ page }) => {
  await loginSuperAdmin(page);
  await page.goto('/admin/modules/numbers');

  // ── Create ──
  await page.getByRole('button', { name: 'Ajouter un sous-mode' }).click();
  const modal = page.locator('.modal');
  await modal.locator('input[placeholder="arithmetic"]').fill('etesting');
  await modal.locator('div.grow', { hasText: 'Nom (FR)' }).locator('input').fill('E2E test');
  await modal.locator('div.grow', { hasText: 'Nom (EN)' }).locator('input').fill('E2E test');
  await modal.getByPlaceholder(/MCQ-number/).fill('e2e mechanic hint');
  await modal.getByRole('button', { name: 'Enregistrer' }).click();

  await pollUntil(
    () => prisma.subMode.findUnique({ where: { id: SUB_MODE_ID } }),
    (row) => row !== null,
  );
  await expect(page.getByText('numbers.etesting')).toBeVisible();

  // ── Delete ──
  const row = page.locator('tr', { hasText: 'etesting' });
  await row.getByRole('button', { name: 'Supprimer' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Supprimer' }).click();

  await pollUntil(
    () => prisma.subMode.findUnique({ where: { id: SUB_MODE_ID } }),
    (row) => row === null,
  );
  await expect(page.getByText('numbers.etesting')).toHaveCount(0);
});
