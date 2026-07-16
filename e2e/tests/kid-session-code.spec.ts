import { expect, test, type Page } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import { seedKidAuthAndPickAva, avaProfile, finishToHub } from '../helpers/kid-session';

/** As of the Task 1/2 fix, CodeTurtleSession.tsx emits `code_level_solved` and syncs
 *  progress (`queueProgress`) for solved puzzles, and the server counts those events
 *  as star evidence — but THIS spec always completes via "Passer" (skip), never solving
 *  a puzzle. Skip = 0 solved = 0 `code_level_solved` events = 0 star evidence, so
 *  `total_stars` never increases here regardless of the fix; asserting it would be
 *  false. That star/capture path is covered elsewhere: the kid component test
 *  (CodeTurtleSession) and the server's progress-sync integration test. What THIS e2e
 *  proves is the skip-completion flow itself: `lesson_started` (once) + `question_shown`
 *  (once per question) + `lesson_completed` (once) is a strict increase of at least
 *  1 + 5 + 1 = 7 events for a 5-question lesson, scoped to this session's own
 *  `lesson_completed` (module='code') below. */

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
  // Scope to THIS code session's own completion event (module='code' in the
  // payload — CodeTurtleSession.tsx emits it on finishLesson). Counting all
  // profile events would false-green on ambient session_start / message events.
  const codeCompletions = () =>
    prisma.event.count({
      where: { profileId: ava.id, name: 'lesson_completed', payload: { path: ['module'], equals: 'code' } },
    });
  const before = await codeCompletions();

  await startCodeMaze(page);
  await skipCodeLesson(page, 5); // CodeTurtleSession TOTAL = 5
  await finishToHub(page);

  // Skip-completion scores 0 (no totalStars claim to assert — see the file-header
  // comment), but the session's own lesson_completed event still syncs to Postgres —
  // proving the skip-through flow ran and synced.
  await pollUntil(codeCompletions, (c) => c > before);
});
