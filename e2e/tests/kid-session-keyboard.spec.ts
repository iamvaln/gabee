import { expect, test, type Page } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import { seedKidAuthAndPickAva, avaProfile, finishToHub } from '../helpers/kid-session';

/** `total_stars` genuinely cannot be asserted here — this is a confirmed SERVER-SIDE
 *  product bug, not a test-timing issue (see `.superpowers/sdd/task-2-report.md` for
 *  the full live-debugged trail). KeyboardStaticSession.tsx computes
 *  `total_stars = profile.total_stars + correctCount` client-side and syncs the claim
 *  (line ~225), but apps/web/src/lib/server/services/progress.ts's `syncProgress`
 *  bounds every claimed `total_stars` by `countEvidencedStars` — a count of
 *  `question_answered` events with `payload.correct === true` (+ claimed gifts). The
 *  keyboard/typing screens (KeyboardStaticSession.tsx, KeyboardScrollingSession.tsx)
 *  never enqueue `question_answered` — they only emit `lesson_started`,
 *  `question_shown`, `typing_keystroke`, `typing_word_completed`, `lesson_completed`.
 *  So the server's evidence cap never grows from keyboard play, and a keyboard
 *  session's star claim is silently clamped back to the pre-session value — reliably,
 *  every time, regardless of typing speed/accuracy/timing. Confirmed live: after a
 *  full 7/7 correct run, Postgres showed `typing_keystroke` count +7 (one correct
 *  keystroke per single-letter L1 prompt) and `typing_word_completed` +7, but zero
 *  `question_answered` rows and an unchanged `total_stars`.
 *  `typing_keystroke` / `typing_word_completed` are emitted EXCLUSIVELY by the two
 *  keyboard screens (grep confirms no other module uses these event names), so a
 *  strict increase in their count is an unambiguous, non-gameable proof that the
 *  session actually ran the full typing flow — this is the assertion below. */

/** `startModule` (kid-session.ts) can't be reused as-is: its post-navigation
 *  wait is MCQ-specific (`.session-answers .answer-btn`, never rendered by the
 *  keyboard/copy session — see KeyboardStaticSession.tsx, which renders
 *  `.session-prompt` char spans instead). Mirrors startModule's navigation but
 *  waits on the right post-condition. */
async function startKeyboardStatic(page: Page): Promise<void> {
  await page.locator('button.module-tile[data-module="keyboard"]').click();
  await page.getByRole('button', { name: /S'entraîner sur du texte/ }).click(); // static/copy sub-hub tile
  await expect(page.locator('.session-prompt span').first()).toBeVisible();
}

/** Brute-force a static (copy) keyboard session: read the per-char target spans
 *  under `.session-prompt` (NOT `.innerText()` on the prompt itself — that div
 *  also contains a sibling instruction line, `t('keyboard.typeHighlighted')`;
 *  see KeyboardStaticSession.tsx lines 422-475), type each char, then advance.
 *  `textContent` (not `innerText`) on the spans avoids CSS whitespace-collapse
 *  risk on a bare-space char span (line 467) — moot at level 1 (single ASCII
 *  letters, no spaces; see seed-data/keyboard.json copy/level 1) but keeps this
 *  correct if a longer/word-level target is ever sampled in. Level-1 comparison
 *  is case-insensitive (line 334), so `page.keyboard.press(ch)` per char is a
 *  safe, single-key-per-char press (no accents/spaces to worry about at level 1).
 *
 *  Advance via Enter, NOT a mouse click on `.feedback-strip .btn`: the component
 *  wires a global `Enter` handler for exactly this ("stay on the keyboard between
 *  questions", lines 282-293). A `.click()` on the button was flaky on the LAST
 *  question — `finishLesson()` does heavier async work there (flushEvents,
 *  persistProgress, a possible first-badge milestone dialog) and tears the button
 *  down mid-transition, so Playwright's mouse-click actionability check (element
 *  must be visible+stable+not-moving across two frames) got stuck retrying
 *  "element is not stable" / "detached from the DOM" for the full 180s test
 *  timeout. `page.keyboard.press('Enter')` dispatches to whatever's focused with
 *  no target-element stability wait, sidestepping that race entirely.
 *
 *  RACE FIXED HERE (this was the intermittent flake — 1 run in several, ~17s
 *  hang then `expect(locator).toBeVisible()` timeout): the keydown handler's
 *  effect closure (KeyboardStaticSession.tsx line ~395) depends on `typedLen` +
 *  `target` and reads `pos = typedLen` (line ~330). Two failure modes were
 *  possible:
 *   1. Reading a STALE target: right after Enter advances `qIdx`, the previous
 *      question's `.session-prompt span`s can still be the ones in the DOM for
 *      one tick (same selector matches both), so `chars.allTextContents()`
 *      could grab the old prompt and type characters that don't match the new
 *      one. Fixed by waiting for `.session-progress .dots`' `aria-label`
 *      (`question N of total`, SessionHeader.tsx line ~37) to report the
 *      expected 1-indexed question number before reading the prompt — that
 *      attribute is driven by the same `current`/`qIdx` state and commits in
 *      the same React pass as the prompt spans, and unlike comparing target
 *      TEXT across questions it can't false-negative when two consecutive L1
 *      prompts happen to sample the same letter.
 *   2. Pressing faster than React commits `typedLen`: fixed by typing with a
 *      settle delay (`keyboard.type(..., { delay: 60 })`) instead of
 *      back-to-back `press()` calls.
 *  Belt-and-suspenders: a bounded (max 2 attempts, never unbounded) self-heal
 *  retype below — if "Suivant" still doesn't show up, read how many chars
 *  actually registered via the `isTyped` span color (line ~463,
 *  `#94a3b8` = `rgb(148, 163, 184)`) and retype only the missing suffix. */
async function typeKeyboardLesson(page: Page, total: number): Promise<void> {
  const dots = page.locator('.session-progress .dots');
  const chars = page.locator('.session-prompt span');
  const typedCount = () =>
    chars.evaluateAll(
      (spans) => spans.filter((el) => getComputedStyle(el).color === 'rgb(148, 163, 184)').length,
    );

  for (let q = 0; q < total; q++) {
    // Confirm the DOM has actually committed question `q` before reading its
    // target — see the RACE FIXED HERE note above.
    await expect(dots).toHaveAttribute('aria-label', `question ${q + 1} of ${total}`);
    await expect(chars.first()).toBeVisible();
    const target = (await chars.allTextContents()).join('');

    await page.keyboard.type(target, { delay: 60 }); // settle time for typedLen to commit

    // Bounded self-heal: at most one retype of the missing suffix.
    for (let attempt = 0; ; attempt++) {
      try {
        await expect(page.locator('.feedback-strip .btn')).toBeVisible({ timeout: 5_000 });
        break;
      } catch (err) {
        if (attempt >= 1) throw err; // never loop unboundedly — surface the failure
        const registered = await typedCount();
        const remaining = target.slice(registered);
        if (remaining.length > 0) await page.keyboard.type(remaining, { delay: 60 });
      }
    }
    await page.keyboard.press('Enter'); // same as tapping "Suivant"
  }
}

test('keyboard: a full static (copy) session types every prompt and persists events', async ({
  page,
}) => {
  await seedKidAuthAndPickAva(page);
  const ava = await avaProfile();
  const countKeystrokes = () =>
    prisma.event.count({ where: { profileId: ava.id, name: 'typing_keystroke' } });
  const before = await countKeystrokes();

  await startKeyboardStatic(page);
  await typeKeyboardLesson(page, 7); // KeyboardStaticSession TOTAL = 7
  await finishToHub(page);

  // One `typing_keystroke` event per correctly-typed prompt (L1 = single-letter
  // targets, so exactly one correct keystroke each) — see the file-header comment
  // for why `total_stars` can't be the assertion here.
  await pollUntil(countKeystrokes, (n) => n >= before + 7);
});
