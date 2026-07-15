import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../helpers/db';
import { seedEmailConfirmation } from '../../helpers/seed';

test('parent signup → confirm → login → dashboard → change password', async ({ page }) => {
  const email = `e2e-parent-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'e2ePass123';

  // ── Signup (real form) ──
  // Phone widget: default country is CM (signup/page.tsx L38/L85 — `PRIMARY_CODES = ['CM']`,
  // `phoneCountry` initial state `'CM'`), not FR. '612345678' validates as a real mobile
  // number under both CM (+237612345678) and FR (+33612345678) per libphonenumber-js, so the
  // brief's national number enables the submit button regardless of default country.
  await page.goto('/parent/signup');
  await page.locator('#pf').fill('Testy');
  await page.locator('#pl').fill('Parent');
  await page.locator('#pe').fill(email);
  await page.locator('#pp').fill(password);
  await page.locator('#pp2').fill(password);
  await page.locator('#pph').fill('612345678'); // valid mobile number for the CM default country
  await page.getByRole('button', { name: /J'accepte/ }).click();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifie tes mails' })).toBeVisible();

  // ── Confirm (seed a known token — DB only stores sha256) ──
  const parent = await prisma.parentAccount.findUniqueOrThrow({ where: { email } });
  expect(parent.emailConfirmedAt).toBeNull();
  const { rawToken } = await seedEmailConfirmation(parent.id);
  await page.goto(`/parent/confirm-email?token=${rawToken}`);
  await expect(page.getByRole('heading', { name: 'Email confirmé !' })).toBeVisible();
  const confirmed = await prisma.parentAccount.findUniqueOrThrow({ where: { id: parent.id } });
  expect(confirmed.emailConfirmedAt).not.toBeNull(); // consume really stamped it

  // ── Login ──
  await page.goto('/parent/login');
  await page.locator('#pe').fill(email);
  await page.locator('#pp').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/parent$/);
  await expect(page.getByRole('heading', { name: 'Bienvenue chez Gabee !' })).toBeVisible(); // 0-kids empty state (parent/page.tsx L107, <h3>)

  // ── Change password ──
  // password-tab.tsx L67/137/154: `<label>` has no `htmlFor` and is a sibling (not a
  // wrapper) of the `<input>`, which has no `id` — getByLabel can't resolve these. Fall
  // back to the documented autocomplete-attribute locators. "Nouveau mot de passe" and
  // "Confirmer" both use autocomplete="new-password" (L142, L158); order in the DOM is
  // new password first, confirm second.
  await page.goto('/parent/settings?tab=password');
  await page.locator('input[autocomplete="current-password"]').fill(password);
  const newPasswordInputs = page.locator('input[autocomplete="new-password"]');
  await newPasswordInputs.nth(0).fill('e2eNewPass456');
  await newPasswordInputs.nth(1).fill('e2eNewPass456');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page.getByText('Mot de passe changé.')).toBeVisible();
});
