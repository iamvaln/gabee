import { test, expect } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import {
  seedKidAuthAndPickAva,
  avaProfile,
  completeMcqLesson,
  finishToHub,
} from '../helpers/kid-session';

test('translation: a full session persists stars', async ({ page }) => {
  await seedKidAuthAndPickAva(page);
  const ava = await avaProfile();
  const before = ava.totalStars;

  // Post-rework, translation is two independently tracked directions: the Hub tile
  // opens the sub-hub (FR→EN / EN→FR), picking a direction opens its lesson map, and
  // the first unlocked lesson starts the session (App.tsx: translation →
  // translation_subhub → *_lessonmap → *_session).
  await page.locator('button.module-tile[data-module="translation"]').click();
  await page.getByRole('button', { name: /FR\s*→\s*EN/ }).click();
  await page.locator('.level-grid .level-tile.unlocked').first().click();
  await expect(page.locator('.session-answers .answer-btn').first()).toBeVisible();
  await completeMcqLesson(page, 7); // TranslationSession TOTAL = 7
  await finishToHub(page);

  // MCQ modules (unlike keyboard's typing screens — see kid-session-keyboard.spec.ts's
  // file-header note) emit question_answered, so the server's evidence-capped
  // total_stars actually grows — same as words (kid-session-words.spec.ts).
  await pollUntil(
    async () => (await prisma.childProfile.findUniqueOrThrow({ where: { id: ava.id } })).totalStars,
    (s) => s > before,
  );
});
