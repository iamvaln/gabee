import { test, expect, type Page } from '@playwright/test';
import { prisma, FIXTURES, pollUntil } from '../../helpers/db';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '10.20.0.5' } }); // distinct IP: admin login rate-limit is per-IP

async function loginSuperAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#ae').fill(FIXTURES.adminEmail);
  await page.locator('#ap').fill(FIXTURES.adminPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// Level 1 has no prior level, so prereqs_met is always true and the editor is
// unlocked (higher levels gate on the previous level being accepted). beforeEach
// clears this slot's plan so the editor starts empty.
const SLOT = { module: 'numbers', subMode: 'counting', level: 1 };

test.beforeEach(async () => {
  await prisma.contentPlan.deleteMany({
    where: { moduleId: SLOT.module as never, subMode: SLOT.subMode, level: SLOT.level },
  });
});

test('super_admin fills a plan → save → accept (parity satisfied)', async ({ page }) => {
  await loginSuperAdmin(page);
  await page.goto(`/admin/content/plan?module=${SLOT.module}&sub_mode=${SLOT.subMode}&level=${SLOT.level}`);

  // Scope card (unlabeled textareas — FR then EN).
  const scope = page.locator('.card', { has: page.locator('.field-label', { hasText: 'Portée' }) }).locator('textarea');
  await scope.nth(0).fill('Portée FR e2e');
  await scope.nth(1).fill('Scope EN e2e');

  // The editor renders one empty objective row on load; fill it (adding another
  // would leave a blank objective and fail the parity gate). Objective textareas
  // are the only ones with FR/EN placeholders, so getByPlaceholder is unambiguous.
  await page.getByPlaceholder('FR').first().fill('Objectif FR e2e');
  await page.getByPlaceholder('EN').first().fill('Objective EN e2e');

  // Validation card (unlabeled textareas — FR then EN).
  const validation = page
    .locator('.card', { has: page.locator('.field-label', { hasText: 'Critères de validation' }) })
    .locator('textarea');
  await validation.nth(0).fill('Critère FR e2e');
  await validation.nth(1).fill('Criteria EN e2e');

  // Save → the plan row is persisted (pending).
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  const saved = await pollUntil(
    () =>
      prisma.contentPlan.findFirst({
        where: { moduleId: SLOT.module as never, subMode: SLOT.subMode, level: SLOT.level },
        select: { status: true },
      }),
    (row) => row !== null,
  );
  expect(saved).not.toBeNull();

  // Accept → parity passes, the plan flips to accepted.
  await page.getByRole('button', { name: 'Accepter' }).click();
  const accepted = await pollUntil(
    () =>
      prisma.contentPlan.findFirstOrThrow({
        where: { moduleId: SLOT.module as never, subMode: SLOT.subMode, level: SLOT.level },
        select: { status: true, acceptedBy: true },
      }),
    (row) => row.status === 'accepted',
  );
  expect(accepted.acceptedBy).not.toBeNull();
});
