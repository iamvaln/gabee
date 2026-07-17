import { test, expect } from '@playwright/test';
import { prisma, FIXTURES, seedPendingPublish, pollUntil } from '../../helpers/db';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '10.20.0.3' } }); // distinct IP: admin login rate-limit is per-IP

async function loginSuperAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await page.locator('#ae').fill(FIXTURES.adminEmail);
  await page.locator('#ap').fill(FIXTURES.adminPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('super_admin publishes a module with a pending diff → new bundle version + audit', async ({ page }) => {
  // Manufacture a pending change: a confirmed question not yet in the numbers snapshot.
  const { questionId, nextVersion } = await seedPendingPublish('numbers', `${Date.now()}`);

  await loginSuperAdmin(page);
  await page.goto('/admin/content/publish');

  // The numbers card now shows a pending diff and the publish button.
  const publishBtn = page.getByRole('button', { name: new RegExp(`Publier v${nextVersion}`) }).first();
  await expect(publishBtn).toBeVisible();
  await publishBtn.click();

  // Confirm in the modal (scoped so we don't re-hit the card's same-named button).
  await page.locator('.modal').getByRole('button', { name: new RegExp(`Publier v${nextVersion}`) }).click();

  // DB is the non-vacuous assertion: the new snapshot exists and includes our id.
  const snapshot = await pollUntil(
    () =>
      prisma.contentBundleVersion.findFirst({
        where: { module: 'numbers', version: nextVersion },
        select: { version: true, questionIds: true },
      }),
    (row) => row !== null,
  );
  expect(snapshot?.questionIds).toContain(questionId);

  // The publish wrote a bundle.publish audit row for this version.
  const audit = await prisma.auditLog.findFirst({
    where: { kind: 'bundle.publish', targetId: `numbers:${nextVersion}` },
  });
  expect(audit).not.toBeNull();

  // The UI reflects the publish: the modal closed and the card is now up to date
  // (no pending changes for this freshly-published version).
  await expect(page.locator('.modal')).toHaveCount(0);
});
