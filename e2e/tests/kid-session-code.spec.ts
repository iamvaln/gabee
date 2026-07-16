import { expect, test, type Page } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import { seedKidAuthAndPickAva, avaProfile, finishToHub } from '../helpers/kid-session';

/** Code progress is genuinely localStorage-only — CodeTurtleSession.tsx never calls
 *  `queueProgress`/touches `total_stars` (confirmed by reading the source: `finishLesson`
 *  only does `enqueueEvent(lesson_completed)` + `flushEvents()` + `persistLocal` (writes
 *  to `lib/codeTrack`, not the server) + `clearResume`). So `totalStars` can't be the
 *  assertion here (it's never claimed, unlike the keyboard-screen server-side bug in
 *  task-2-report.md, where a claim IS made but silently clamped). Code's events DO sync:
 *  `lesson_started` (once) + `question_shown` (once per question) + `lesson_completed`
 *  (once) is a strict increase of at least 5 + 5 + 1 = 11 events for a 5-question lesson.
 *  A strict count increase is proof the full skip-through flow ran and synced. */

/** `startModule` (kid-session.ts) can't be reused as-is: its post-navigation wait is
 *  MCQ-specific (`.session-answers .answer-btn`), never rendered by the code/turtle
 *  session (it renders a puzzle grid + block palette + "Passer" button instead). Mirrors
 *  startModule's navigation but waits on the right post-condition. */
async function startCodeMaze(page: Page): Promise<void> {
  await page.locator('button.module-tile[data-module="code"]').click();
  await page.getByRole('button', { name: /Parcours/ }).click(); // maze sub-hub tile
  await expect(page.getByRole('button', { name: 'Passer', exact: true })).toBeVisible();
}

/** Skip through a code lesson via "Passer" (`t('code.skip')`) — puzzles build a
 *  drag-free arrow program and aren't solvable from the DOM without simulating the
 *  turtle engine, but skip advances every question and finishes the lesson on the last.
 *
 *  First-question guided onboarding: a fresh (profile, sub-mode) pair shows a gated
 *  walkthrough overlay (`useGuide`/`guideScripts.ts`) that disables "Passer"
 *  (`disabled={running || guide.active}`) until dismissed. `exact: true` is required
 *  everywhere here — Playwright's default role-name match is a case-insensitive
 *  *substring*, and "Je sais, passer" (the guide's own skip button) contains "passer",
 *  so a non-exact "Passer" locator resolves to both buttons (strict-mode violation)
 *  while the guide is showing. Dismiss the guide first (only ever possible on the very
 *  first question — `isFirstExercise` in CodeTurtleSession.tsx gates it to qIdx === 0),
 *  then click the real skip button. */
async function skipCodeLesson(page: Page, total: number): Promise<void> {
  for (let q = 0; q < total; q++) {
    if (q === 0) {
      try {
        const guideSkip = page.getByRole('button', { name: 'Je sais, passer', exact: true });
        await guideSkip.waitFor({ state: 'visible', timeout: 3_000 });
        await guideSkip.click();
      } catch {
        /* no guided onboarding this time (already seen, or puzzle has no reference solution) */
      }
    }
    const skip = page.getByRole('button', { name: 'Passer', exact: true });
    await expect(skip).toBeVisible();
    if (q === total - 1) {
      // The last "Passer" triggers finishLesson(), which awaits flushEvents() before
      // onDone() unmounts this screen for the Summary — same actionability race as
      // Task 2's keyboard Enter-advance (see kid-session-keyboard.spec.ts's file-header
      // comment): a `.click()` on a control that tears down mid-transition can hang the
      // full 180s test timeout retrying "element is not stable"/"detached from the DOM".
      // Guard with a short action timeout + catch; the real proof of completion is
      // `finishToHub` reaching "Accueil" (and the events-count assertion below), not
      // this click resolving cleanly.
      await skip.click({ timeout: 5_000 }).catch(() => {});
    } else {
      await skip.click();
    }
  }
}

test('code: a full session completes via skip and syncs its events', async ({ page }) => {
  await seedKidAuthAndPickAva(page);
  const ava = await avaProfile();
  const eventsBefore = await prisma.event.count({ where: { profileId: ava.id } });

  await startCodeMaze(page);
  await skipCodeLesson(page, 5); // CodeTurtleSession TOTAL = 5
  await finishToHub(page);

  // Code progress is localStorage-only (no totalStars claim to assert), but its
  // events (lesson_started + 5x question_shown + lesson_completed) sync to Postgres.
  await pollUntil(
    () => prisma.event.count({ where: { profileId: ava.id } }),
    (c) => c > eventsBefore,
  );
});
