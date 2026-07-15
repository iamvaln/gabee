import { test, expect, type Page } from '@playwright/test';
import { prisma, pollUntil, FIXTURES } from '../helpers/db';

/** Count rows in the kid app's Dexie 'events' queue (IndexedDB 'gabee-kid'). */
function dexieEventCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('gabee-kid');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('events', 'readonly').objectStore('events').count();
          req.onsuccess = () => {
            resolve(req.result);
            db.close();
          };
          req.onerror = () => {
            reject(req.error);
            db.close();
          };
        };
      }),
  );
}

/** Count rows in the kid app's Dexie 'progress' queue (IndexedDB 'gabee-kid'). */
function dexieProgressCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('gabee-kid');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('progress', 'readonly').objectStore('progress').count();
          req.onsuccess = () => {
            resolve(req.result);
            db.close();
          };
          req.onerror = () => {
            reject(req.error);
            db.close();
          };
        };
      }),
  );
}

/** All queued envelope event_ids from the Dexie 'events' queue. */
function dexieEventIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('gabee-kid');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('events', 'readonly').objectStore('events').getAll();
          req.onsuccess = () => {
            resolve(
              (req.result as Array<{ envelope: { event_id: string } }>).map(
                (row) => row.envelope.event_id,
              ),
            );
            db.close();
          };
          req.onerror = () => {
            reject(req.error);
            db.close();
          };
        };
      }),
  );
}

/** Answer the current question by brute force: options never advance on a wrong
 * pick (same question replays, same order), so walk the options until "Suivant". */
async function answerCurrentQuestion(page: Page): Promise<void> {
  const answers = page.locator('.session-answers .answer-btn');
  await expect(answers.first()).toBeVisible();
  const optionCount = await answers.count();
  for (let i = 0; i < optionCount; i++) {
    await answers.nth(i).click();
    const feedbackBtn = page.locator('.feedback-strip .btn');
    await expect(feedbackBtn).toBeVisible();
    const label = (await feedbackBtn.textContent()) ?? '';
    await feedbackBtn.click(); // "Suivant" advances; "Réessayer" replays the same question
    if (label.includes('Suivant')) return;
  }
  throw new Error('exhausted all answer options without finding the correct one');
}

/** Complete a full 7-question numbers lesson and return to the hub. */
async function completeLessonAndGoHome(page: Page): Promise<void> {
  for (let q = 0; q < 7; q++) {
    await answerCurrentQuestion(page);
  }
  // Summary; a first-badge milestone dialog may cover it (click-through, 6s auto-dismiss).
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

async function startNumbersSession(page: Page): Promise<void> {
  await page.locator('button.module-tile[data-module="numbers"]').click();
  await page.getByRole('button', { name: /Nombres & comptage/ }).click();
  await expect(page.locator('.session-answers .answer-btn').first()).toBeVisible();
}

test('offline session syncs every queued event to Postgres on reconnect', async ({
  page,
  context,
}) => {
  // ── Phase A (online): login, skip device pairing, pick profile, one warm-up
  // session — this Dexie-caches the numbers bundle so the offline session can run.
  await page.goto('/');
  await page.getByPlaceholder('Adresse e-mail').fill(FIXTURES.parentEmail);
  await page.getByPlaceholder('Mot de passe').fill(FIXTURES.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('button', { name: /Plus tard/ }).click();
  await page.getByRole('button', { name: FIXTURES.childName }).click();
  await startNumbersSession(page);
  await completeLessonAndGoHome(page);

  const child = await prisma.childProfile.findFirstOrThrow({
    where: { name: FIXTURES.childName },
  });

  // Warm-up events reach the server and the kid-side queue fully drains,
  // so phase B starts from a clean, unambiguous baseline.
  await pollUntil(() => prisma.event.count({ where: { profileId: child.id } }), (c) => c > 0);
  await pollUntil(() => dexieEventCount(page), (c) => c === 0);
  // Progress rows are only deleted after server ack (apps/kid/src/lib/sync.ts drainProgress),
  // so the baseline must wait for that drain too — otherwise the warm-up's own stars could
  // still be in flight and land during phase C, making `s > starsAfterWarmup` a false green.
  await pollUntil(() => dexieProgressCount(page), (c) => c === 0);
  const starsAfterWarmup = (
    await prisma.childProfile.findUniqueOrThrow({ where: { id: child.id } })
  ).totalStars;

  // ── Phase B (offline): full session with the network down.
  await context.setOffline(true);
  await startNumbersSession(page);
  await completeLessonAndGoHome(page);

  // Everything queued locally; nothing reached the server.
  const queuedIds = await dexieEventIds(page);
  expect(queuedIds.length).toBeGreaterThanOrEqual(16); // lesson_started + ≥7 shown + ≥7 answered + lesson_completed
  expect(
    await prisma.event.count({ where: { eventId: { in: queuedIds } } }),
  ).toBe(0);

  // ── Phase C (reconnect): SyncManager's 'online' handler flushes automatically.
  await context.setOffline(false);
  await pollUntil(
    () => prisma.event.count({ where: { eventId: { in: queuedIds } } }),
    (c) => c === queuedIds.length, // EVERY queued event row lands in Postgres (phase1 DoD)
  );
  await pollUntil(() => dexieEventCount(page), (c) => c === 0); // queue fully drained
  // Progress syncs in a separate round-trip after events (drainEvents → drainProgress),
  // so poll rather than read once — the events queue can drain before the snapshot lands.
  await pollUntil(
    async () =>
      (await prisma.childProfile.findUniqueOrThrow({ where: { id: child.id } })).totalStars,
    (s) => s > starsAfterWarmup, // offline progress merged too
  );
});
