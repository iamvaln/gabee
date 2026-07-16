import { test, expect } from '@playwright/test';
import { prisma, FIXTURES } from '../../helpers/db';
import { seedPendingClassification } from '../../helpers/seed';

test('parent classifies a pending session and the queue empties', async ({ page }) => {
  const parent = await prisma.parentAccount.findUniqueOrThrow({ where: { email: FIXTURES.parentEmail } });
  const { sessionId } = await seedPendingClassification({ parentId: parent.id });

  // Login as the (confirmed) fixture parent
  await page.goto('/parent/login');
  await page.locator('#pe').fill(FIXTURES.parentEmail);
  await page.locator('#pp').fill(FIXTURES.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/parent$/);

  // Classify the pending session(s)
  await page.goto('/parent/classify');
  await expect(page.locator('h1.classify-q')).toBeVisible();

  const doneHeading = page.getByRole('heading', { name: 'Tout est revu !' });
  const chooseBtn = page.getByRole('button', { name: 'À son initiative', disabled: false });
  // With a fully-filtered `--project=parent` run tester1 has exactly this one
  // pending row. But the `--project` CLI flag doesn't actually filter test
  // selection through this repo's pnpm-forwarded `test` script (see Task 2's
  // report), so an unfiltered run also executes the `kid` project first,
  // whose kid-offline-sync spec logs in as tester1/Ava and completes real
  // sessions — leaving a genuine extra pending classification for Ava ahead
  // of ours in the queue. Click through every card until the queue empties;
  // our specific seeded session's persisted label is asserted below
  // regardless of click order. Bounded loop so a real "queue never empties"
  // product bug still fails loudly instead of hanging.
  //
  // The loop below stays defensive against timing even though the classify
  // double-submit race is now fixed: choose() keeps the choice button
  // disabled until the next card mounts (submitting clears inside the
  // ~260ms `setTimeout(advance, 260)`), and the server write is idempotent
  // (updateMany gated on `label: null`, so a re-submit is a no-op). A plain
  // `.click()` can still catch the button mid teardown and hang waiting for
  // a node that's gone once the card swaps or the queue empties (refill
  // round-trip via GET /api/classifications/pending). So:
  // `disabled: false` avoids matching the stale/submitting node; `.or
  // (doneHeading)` covers "the last click went straight to the done
  // screen, no next card"; `networkidle` after each click gives the ~260ms
  // transition (and any refill) time to land before re-checking; and
  // `force: true` with a bounded timeout + retry sidesteps Playwright's own
  // actionability wait (stable → scroll → dispatch), which otherwise has a
  // race window where the card flips out from under it mid-click.
  for (let i = 0; i < 10; i++) {
    await expect(chooseBtn.or(doneHeading)).toBeVisible();
    if (await doneHeading.isVisible()) break;
    try {
      await chooseBtn.click({ force: true, timeout: 5_000 });
    } catch {
      continue; // card flipped out from under the click — re-check next iteration
    }
    await page.waitForLoadState('networkidle');
  }

  // Queue empties → thank-you screen, and the label is persisted
  await expect(doneHeading).toBeVisible();
  const row = await prisma.sessionClassification.findUniqueOrThrow({ where: { sessionId } });
  expect(row.label).toBe('child_initiated');
});
