import { test, expect } from '@playwright/test';
import { prisma, FIXTURES } from '../../helpers/db';

test('admin logs in and reaches dashboard, healthy-use, users, content', async ({ page }) => {
  // ── Login (super_admin fixture) ──
  await page.goto('/admin/login');
  await page.locator('#ae').fill(FIXTURES.adminEmail);
  await page.locator('#ap').fill(FIXTURES.adminPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  // ── Healthy-use: save the (unchanged, valid) limits → success banner ──
  // healthy-use-form.tsx: the save button is only `disabled={busy}` (not gated on a
  // diff), and tester2 is super_admin so `canEdit` is true and the button renders.
  await page.goto('/admin/healthy-use');
  await expect(page.getByRole('heading', { name: 'Usage sain' })).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Limites enregistrées.')).toBeVisible();

  // ── Users: the parents table lists a seeded fixture parent ──
  await page.goto('/admin/users/parents');
  await expect(page.getByRole('heading', { name: 'Parents' })).toBeVisible();
  await expect(page.getByText(FIXTURES.parentEmail)).toBeVisible(); // tester1 row

  // ── Content: the plan/pool matrix renders (view-only — no Publish click; all
  // modules are already published post-global-setup with no pending diff) ──
  await page.goto('/admin/content');
  await expect(page.getByRole('heading', { name: 'Contenu' })).toBeVisible();
  await expect(page.locator('table.matrix')).toBeVisible();
});
