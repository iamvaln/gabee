import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../helpers/db';
import { seedEmailConfirmation } from '../../helpers/seed';

test('parent signup → confirm → login → dashboard → change password', async ({ page }) => {
  const email = `e2e-parent-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'e2ePass123';

  // ── Signup (via the route — the plan's authorized fallback) ──
  // The signup FORM's submit stays `disabled until valid`, gated on a 6-field
  // client validation incl. a libphonenumber parse of a controlled phone input.
  // On the slower CI runner, Playwright's fills land before React hydrates the
  // controlled inputs, so `valid` never flips and the submit click hangs to the
  // 180s test timeout (passes locally where hydration wins the race). Driving the
  // signup ROUTE directly is robust and still exercises it end-to-end; the confirm
  // → login → dashboard → password steps below remain real-UI. (The signup form's
  // own contract is covered by the phase-3a service/route integration tests.)
  const signup = await page.request.post('/api/auth/signup', {
    data: { email, password, phone: '+237612345678' }, // valid CM E.164
  });
  expect(signup.status()).toBe(201);

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
  const before = await prisma.parentCredential.findFirstOrThrow({
    where: { parentId: parent.id, retiredAt: null },
  });
  await page.goto('/parent/settings?tab=password');
  await page.locator('input[autocomplete="current-password"]').fill(password);
  const newPasswordInputs = page.locator('input[autocomplete="new-password"]');
  await newPasswordInputs.nth(0).fill('e2eNewPass456');
  await newPasswordInputs.nth(1).fill('e2eNewPass456');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page.getByText('Mot de passe changé.')).toBeVisible();

  // Effect check: the change actually rotated the credential (guards against a
  // route that returns 200 without writing) — one active credential, new hash.
  const active = await prisma.parentCredential.findMany({ where: { parentId: parent.id, retiredAt: null } });
  expect(active).toHaveLength(1);
  expect(active[0]!.hash).not.toBe(before.hash);
});
