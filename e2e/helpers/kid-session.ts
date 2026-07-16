import { expect, type Page } from '@playwright/test';
import { prisma, FIXTURES } from './db';

/** Log in via the kid app as the fixture parent, skip device pairing, pick child Ava.
 *  Selectors mirror kid-offline-sync.spec.ts's proven inline login (lines 123-128). */
export async function loginAndPickAva(page: Page): Promise<void> {
  await page.goto('/'); // kid PWA baseURL (:5173)
  await page.getByPlaceholder('Adresse e-mail').fill(FIXTURES.parentEmail);
  await page.getByPlaceholder('Mot de passe').fill(FIXTURES.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('button', { name: /Plus tard/ }).click(); // skip device-link
  await page.getByRole('button', { name: FIXTURES.childName }).click(); // pick Ava
  await expect(page.locator('button.module-tile[data-module="numbers"]')).toBeVisible(); // on the hub
}

export function avaProfile() {
  return prisma.childProfile.findFirstOrThrow({ where: { name: FIXTURES.childName } });
}

/** Navigate from the hub into a module's session. subMode names are the FR sub-hub tile labels.
 *  Tapping the sub-mode tile auto-starts the next unmastered lesson directly into the
 *  session screen (App.tsx's startOrBrowse) — no intermediate level/lesson picker, same
 *  as kid-offline-sync.spec.ts's startNumbersSession. */
export async function startModule(
  page: Page,
  opts: { module: string; subMode?: RegExp },
): Promise<void> {
  await page.locator(`button.module-tile[data-module="${opts.module}"]`).click();
  if (opts.subMode) await page.getByRole('button', { name: opts.subMode }).click();
  await expect(page.locator('.session-answers .answer-btn').first()).toBeVisible();
}

/** Brute-force an MCQ session: wrong picks replay the same question, so walking the
 *  options always terminates. Loops `total` questions, then returns at the summary. */
export async function completeMcqLesson(page: Page, total: number): Promise<void> {
  for (let q = 0; q < total; q++) {
    const answers = page.locator('.session-answers .answer-btn');
    await expect(answers.first()).toBeVisible();
    const n = await answers.count();
    for (let i = 0; i < n; i++) {
      await answers.nth(i).click();
      const btn = page.locator('.feedback-strip .btn');
      await expect(btn).toBeVisible();
      const label = (await btn.textContent()) ?? '';
      await btn.click(); // "Suivant" advances; "Réessayer" replays the same question
      if (label.includes('Suivant')) break;
    }
  }
}

/** Dismiss the first-badge milestone dialog if present, then return to the hub. */
export async function finishToHub(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  try {
    await dialog.waitFor({ state: 'visible', timeout: 3_000 });
    await dialog.click();
  } catch {
    /* no milestone this time */
  }
  await page.getByRole('button', { name: 'Accueil' }).click();
  await expect(page.locator('button.module-tile[data-module="numbers"]')).toBeVisible();
}
