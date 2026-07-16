import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { prisma, FIXTURES } from './db';

/** Log in via the kid app as the fixture parent, skip device pairing, pick child Ava.
 *  Selectors mirror kid-offline-sync.spec.ts's proven inline login (lines 123-128).
 *  Kept for reference — new specs should use `seedKidAuthAndPickAva` instead, since
 *  every kid login shares one rate-limit bucket (cross-origin CORS blocks a per-spec
 *  x-forwarded-for header, so buckets can't be isolated — see kid-session-words.spec.ts). */
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

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Mint a parent-scope session JWT matching apps/web/src/lib/server/auth.ts's
 *  createSessionToken shape (HS256, sub=parentId, {email}, no `scope` claim —
 *  verifySessionToken defaults an unscoped token to 'parent'), signed with
 *  AUTH_JWT_SECRET so the API accepts it exactly like a real login would. */
export function mintKidToken(parentId: string, email: string): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) throw new Error('AUTH_JWT_SECRET is not set — required to mint a kid test JWT');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: parentId, email, iat: now, exp: now + 30 * 24 * 60 * 60 }; // 30d
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(createHmac('sha256', secret).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

/** Seed an authenticated kid session directly into localStorage (skipping /api/auth/login
 *  and the device-link screen entirely), then pick child Ava. Boots straight to
 *  ProfileSelect: `token` + `parent` satisfy the auth gate, `needsDeviceLink: false` skips
 *  LinkDeviceCode, and `profile` is intentionally omitted (not persisted — re-picked each
 *  launch). Shape mirrors the zustand `persist` store in apps/kid/src/store.ts (name
 *  'gabee-kid-store', default version 0, partialize keys: lang/token/parent/
 *  needsDeviceLink/deviceLinkSkipped/audioEnabled). */
export async function seedKidAuthAndPickAva(page: Page): Promise<void> {
  const parent = await prisma.parentAccount.findUniqueOrThrow({
    where: { email: FIXTURES.parentEmail },
  });
  const token = mintKidToken(parent.id, parent.email);
  // Must run before the first navigation so the store rehydrates from it on boot.
  await page.addInitScript(
    (seed) => window.localStorage.setItem('gabee-kid-store', JSON.stringify(seed)),
    {
      state: {
        lang: 'fr',
        token,
        parent: { id: parent.id, email: parent.email },
        needsDeviceLink: false,
        deviceLinkSkipped: false,
        audioEnabled: true,
      },
      version: 0,
    },
  );
  await page.goto('/'); // kid PWA baseURL (:5173)
  await page.getByRole('button', { name: FIXTURES.childName }).click(); // pick Ava
  await expect(page.locator('button.module-tile[data-module="numbers"]')).toBeVisible(); // on the hub
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
 *  options always terminates. Loops `total` questions, then returns at the summary.
 *
 *  Advance via Enter, NOT a mouse click on `.feedback-strip .btn`: every MCQ session
 *  screen (WordsPicture/WordsFill/WordsBuild/WordsRead/Numbers/KeyboardStatic/
 *  Translation) wires an identical global `Enter` handler that calls the same
 *  `next()` the button's onClick calls. A `.click()` on the button is flaky on the
 *  LAST question of the lesson — `next()`'s finish path there does heavier async
 *  work (flushEvents, persistProgress, a possible first-badge milestone dialog) and
 *  can tear the button down mid-transition, so Playwright's mouse-click
 *  actionability check (element must be visible+stable+not-moving across two
 *  frames) gets stuck retrying "element is not stable" / "detached from the DOM"
 *  for the full 180s test timeout (see kid-session-keyboard.spec.ts, which hit this
 *  first). `page.keyboard.press('Enter')` dispatches with no target-element
 *  stability wait, sidestepping that race entirely. The feedback label is read
 *  BEFORE pressing Enter (still needed: "Suivant" vs "Réessayer" tells us whether
 *  Enter is about to advance to the next question or just clear+retry the current
 *  one) — `next()` runs identically either way, on click or on Enter. */
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
      await page.keyboard.press('Enter'); // "Suivant" advances; "Réessayer" clears+retries
      if (label.includes('Suivant')) break;
      if (i === n - 1) throw new Error('exhausted all answer options without finding the correct one');
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
