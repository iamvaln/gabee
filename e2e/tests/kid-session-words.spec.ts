import { test } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import {
  loginAndPickAva,
  avaProfile,
  startModule,
  completeMcqLesson,
  finishToHub,
} from '../helpers/kid-session';

test('words: a full picture session persists stars', async ({ page }) => {
  await loginAndPickAva(page);
  const ava = await avaProfile();
  const before = ava.totalStars;

  await startModule(page, { module: 'words', subMode: /Image → mot/ }); // words-picture sub-hub tile
  await completeMcqLesson(page, 7); // WordsPictureSession TOTAL = 7
  await finishToHub(page);

  await pollUntil(
    async () => (await prisma.childProfile.findUniqueOrThrow({ where: { id: ava.id } })).totalStars,
    (s) => s > before,
  );
});
