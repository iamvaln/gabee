import { test } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import {
  seedKidAuthAndPickAva,
  avaProfile,
  startModule,
  completeMcqLesson,
  finishToHub,
} from '../helpers/kid-session';

test('translation: a full session persists stars', async ({ page }) => {
  await seedKidAuthAndPickAva(page);
  const ava = await avaProfile();
  const before = ava.totalStars;

  // Translation has no sub-hub (App.tsx's enterModule, ~line 469-476): tapping the
  // module tile calls startOrBrowse directly, which auto-starts the next lesson —
  // one click straight into the session, unlike words/numbers/keyboard/code's
  // sub-mode tile pick.
  await startModule(page, { module: 'translation' });
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
