import { test, expect } from '@playwright/test';
import { WEB_URL } from '../playwright.config';
import { prisma, FIXTURES } from '../helpers/db';

test('servers are up, DB is seeded, kid app shows the login screen', async ({ page }) => {
  const health = await page.request.get(`${WEB_URL}/api/health`);
  expect(health.ok()).toBeTruthy();

  // Global setup seeded fixtures + published content.
  const parent = await prisma.parentAccount.findUnique({ where: { email: FIXTURES.parentEmail } });
  expect(parent).not.toBeNull();
  expect(await prisma.question.count({ where: { module: 'numbers', status: 'confirmed' } })).toBeGreaterThan(0);

  // Kid app boots to the (French) login screen.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demande à un adulte' })).toBeVisible();
  await expect(page.getByPlaceholder('Adresse e-mail')).toBeVisible();
});
