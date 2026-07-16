# One-Session-Per-Module E2E (Phase 4b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the spec's Layer-4 kid scenario — "one session per module (numbers, words, keyboard, code, translation) → stars/progression persist" — by driving a full session in each module still uncovered (numbers is already covered by `kid-offline-sync.spec.ts`), asserting server-side persistence.

**Architecture:** Phase 4b of `docs/superpowers/specs/2026-07-14-test-strategy-design.md` (Layer 4), the e2e half of phase 4 (4a = unit tests, merged PR #15). Reuses the existing `e2e/` `kid` Playwright project (built kid PWA `vite preview` :5173 + web `next start` :3000, seeded `gabee_test`). Adds a shared `e2e/helpers/kid-session.ts` (login → pick profile → start-module → complete-session, generalizing the proven `kid-offline-sync.spec.ts` patterns) and one spec per remaining module. Each module's answer strategy differs: MCQ brute-force (words, translation), type-the-DOM-target (keyboard), and skip-to-complete (code — puzzles aren't programmatically solvable and code progress is localStorage-only).

**Tech Stack:** Playwright (`@playwright/test`, chromium), the `e2e/` prisma client for server-side assertions, `FIXTURES` (tester1 + child Ava), French UI selectors.

## Global Constraints

- **Never add `Co-Authored-By`/AI-attribution trailers to commits or PR bodies** (user rule).
- **Zero production code changes.** Test-only phase. If a module can't be driven without a production change, STOP and report (a real bug is a STOP-and-report).
- **Login rate limit is 5 requests / 5 min per client IP.** Every kid spec logs in via `/api/auth/login`. The existing `kid-offline-sync.spec.ts` uses the `kid` project's default IP; each NEW spec here MUST set its OWN distinct `x-forwarded-for` via a file-level `test.use({ extraHTTPHeaders: { 'x-forwarded-for': '<unique>' } })` so it gets its own rate-limit bucket (survives CI `retries: 1`). Assign: words `10.30.0.1`, keyboard `10.30.0.2`, code `10.30.0.3`, translation `10.30.0.4`. (extraHTTPHeaders apply to the kid page's cross-origin fetch to :3000, which the limiter reads.)
- **The kid UI is FRENCH by default.** All selectors are the French strings verified in this plan; do not anglicize.
- **`workers: 1`, global-setup seeds once, NO per-test reset** — child Ava accumulates progress across specs. Each spec reads its OWN `totalStars`/event-count baseline immediately before its session and asserts a strict increase, so order-independence holds.
- **Code is special:** `CodeTurtleSession` NEVER calls `queueProgress` and never touches `total_stars` — code progress is localStorage-only. A code session syncs ONLY events. So the code spec asserts EVENT persistence (Ava's event count increases), NOT `totalStars`. All other modules assert `totalStars` increases (same hook as kid-offline-sync).
- New spec files are named `kid-session-*.spec.ts` so the `kid` project's `testMatch` (`/(smoke|kid-.*)\.spec\.ts/`) auto-runs them — verify this match in Task 1. No `playwright.config.ts` project change is otherwise needed; no CI change (projects auto-run).
- Node 20, pnpm, repo root = worktree root. Branch `feature/test-session-e2e` off `origin/main`.

---

### Task 0: Branch

- [ ] **Step 1:** Worktree/branch `feature/test-session-e2e` off `origin/main` (handled by worktree tooling; verify `git status -sb`). Fresh worktrees need `packages/db/.env` + `pnpm --filter @gabee/db run db:generate`; the local `gabee_test` DB is migrated.

---

### Task 1: Shared kid-session helpers + WORDS session e2e (MCQ)

**Files:**
- Create: `e2e/helpers/kid-session.ts`
- Test: `e2e/tests/kid-session-words.spec.ts`

**Interfaces:**
- Consumes: `prisma`, `FIXTURES`, `pollUntil` from `e2e/helpers/db.ts`; the running kid (:5173) + web (:3000) servers.
- Produces (Tasks 2-4 reuse): `loginAndPickAva(page)`, `avaProfile()`, `startModule(page, {module, subMode?})`, `completeMcqLesson(page, total)`, `finishToHub(page)`.

**Reference:** read `e2e/tests/kid-offline-sync.spec.ts` FIRST — it already logs in via the kid app, skips device-link, picks Ava, and brute-forces an MCQ numbers session. The helpers below GENERALIZE that file's proven inline logic; align every selector to what that file actually uses (login placeholders, the "Plus tard" skip, the milestone `dialog`, `.session-answers .answer-btn`, `.feedback-strip .btn` "Suivant"/"Réessayer", the "Accueil" button). Do NOT modify `kid-offline-sync.spec.ts`.

- [ ] **Step 1: Write the helpers** — `e2e/helpers/kid-session.ts`:

```ts
import { expect, type Page } from '@playwright/test';
import { prisma, FIXTURES } from './db';

/** Log in via the kid app as the fixture parent, skip device pairing, pick child Ava. */
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

/** Navigate from the hub into a module's session. subMode names are the FR sub-hub tile labels. */
export async function startModule(
  page: Page,
  opts: { module: string; subMode?: RegExp },
): Promise<void> {
  await page.locator(`button.module-tile[data-module="${opts.module}"]`).click();
  if (opts.subMode) await page.getByRole('button', { name: opts.subMode }).click();
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
```

(Verify each selector against `kid-offline-sync.spec.ts` — if that file uses a different milestone-dismiss or answer selector, match it. `FIXTURES.childName` is `'Ava'`.)

- [ ] **Step 2: Write the words spec** — `e2e/tests/kid-session-words.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import { loginAndPickAva, avaProfile, startModule, completeMcqLesson, finishToHub } from '../helpers/kid-session';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '10.30.0.1' } }); // own login rate-limit bucket

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
```

- [ ] **Step 3: Run and stabilize** — from the worktree root with env exported (builds via turbo, then serves):

```bash
DATABASE_URL=postgresql://localhost:5432/gabee_test DIRECT_URL=postgresql://localhost:5432/gabee_test \
TEST_DATABASE_URL=postgresql://localhost:5432/gabee_test AUTH_JWT_SECRET=e2e-local-secret-32-chars-minimum-xx \
pnpm run test:e2e
```
Before running, kill any stale servers squatting :3000/:5173 (`lsof -ti:3000,:5173 | xargs -r kill -9`) so Playwright builds+serves THIS worktree — the parallel-worktree server-reuse trap (a phase-3b lesson). Expected: the words spec passes under the `kid` project (alongside the existing kid specs + smoke). The ASSERTION (`totalStars` strictly increases) is the contract. Bounded adjustments (name them in your report): the sub-hub tile label if `Image → mot` differs (read `apps/kid/src/screens/WordsHub.tsx`); the milestone/answer selectors if they differ from `kid-offline-sync.spec.ts`. If a session can't be completed against real behavior (e.g. no words content), STOP and report BLOCKED. Run the words spec 3× for stability.

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/kid-session.ts e2e/tests/kid-session-words.spec.ts
git commit -m "test(e2e/kid): shared session helpers + words picture session persists stars"
```

---

### Task 2: KEYBOARD session e2e (type the DOM target)

**Files:**
- Test: `e2e/tests/kid-session-keyboard.spec.ts`

**Interfaces:**
- Consumes: Task-1 helpers + `prisma`/`pollUntil`; adds a local `typeKeyboardLesson` helper (keyboard isn't MCQ).

**Rule (verified):** `KeyboardStaticSession` renders the target string as individual `<span>` chars inside `.session-prompt`. Read that text, type it (`page.keyboard.type`), then advance ("Suivant" auto-appears on a correctly-typed string; or press Enter). TOTAL = 7. Use the STATIC sub-mode (deterministic — no scroll/animation). Persists `totalStars` like words.

- [ ] **Step 1: Write the test** — `e2e/tests/kid-session-keyboard.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import { loginAndPickAva, avaProfile, startModule, finishToHub } from '../helpers/kid-session';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '10.30.0.2' } });

async function typeKeyboardLesson(page: Page, total: number): Promise<void> {
  for (let q = 0; q < total; q++) {
    const prompt = page.locator('.session-prompt');
    await expect(prompt).toBeVisible();
    // The target is rendered as per-char spans; read its text and type it.
    const target = ((await prompt.innerText()) ?? '').replace(/\s+/g, '');
    for (const ch of target) await page.keyboard.press(ch); // per-char, case-insensitive match
    const next = page.locator('.feedback-strip .btn');
    await expect(next).toBeVisible();
    await next.click(); // "Suivant"
  }
}

test('keyboard: a full static (copy) session persists stars', async ({ page }) => {
  await loginAndPickAva(page);
  const ava = await avaProfile();
  const before = ava.totalStars;

  await startModule(page, { module: 'keyboard', subMode: /S'entraîner sur du texte/ }); // static/copy tile
  await typeKeyboardLesson(page, 7);
  await finishToHub(page);

  await pollUntil(
    async () => (await prisma.childProfile.findUniqueOrThrow({ where: { id: ava.id } })).totalStars,
    (s) => s > before,
  );
});
```

- [ ] **Step 2: Verify the target selector against source FIRST.** Read `apps/kid/src/screens/KeyboardStaticSession.tsx` (~line 444-471): confirm the target chars live under `.session-prompt` and that `innerText` yields exactly the target (no instruction text mixed in). If the instruction is inside the same container, narrow the locator to the char-span wrapper (e.g. a `.prompt-target`/`.target` class the file actually uses) so `target` is JUST the typed string. If a char isn't a single `page.keyboard.press`-able key (e.g. an accented letter or space in the target), switch that question to `page.keyboard.type(target)` (types the whole string) — but confirm level-1 copy targets are simple ASCII first (research: single letters/short words). The assertion (`totalStars` increases) is the contract.

- [ ] **Step 3: Run** — `pnpm run test:e2e` (env-exported, ports clean) → keyboard spec passes. Run 3× for stability (the type-then-advance path is deterministic for static). If typing never yields "Suivant" (target mismatch), fix the selector per Step 2; if it still fails against real behavior, STOP and report BLOCKED.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/kid-session-keyboard.spec.ts
git commit -m "test(e2e/kid): keyboard static session — type the DOM target, stars persist"
```

---

### Task 3: CODE session e2e (skip-to-complete; assert events, not stars)

**Files:**
- Test: `e2e/tests/kid-session-code.spec.ts`

**Interfaces:**
- Consumes: Task-1 `loginAndPickAva`/`avaProfile`/`startModule`/`finishToHub` + `prisma`/`pollUntil`.

**Rules (verified):** `CodeTurtleSession` TOTAL = 5; puzzles are NOT programmatically solvable from the DOM, but a "Passer" (skip) button advances each question and, on the last, finishes the lesson (stars = 1 even at score 0). Code progress is localStorage-only — it does NOT sync `total_stars`. It DOES sync events (`lesson_started`/`question_shown`/`lesson_completed`/`code_run`). So assert Ava's EVENT count increases and the session reaches the summary — do NOT assert `totalStars`.

- [ ] **Step 1: Write the test** — `e2e/tests/kid-session-code.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import { loginAndPickAva, avaProfile, startModule, finishToHub } from '../helpers/kid-session';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '10.30.0.3' } });

test('code: a full session completes via skip and syncs its events', async ({ page }) => {
  await loginAndPickAva(page);
  const ava = await avaProfile();
  const eventsBefore = await prisma.event.count({ where: { profileId: ava.id } });

  await startModule(page, { module: 'code', subMode: /Parcours/ }); // maze sub-hub tile
  // 5 questions, no solving — "Passer" advances each; the last finishes the lesson.
  for (let q = 0; q < 5; q++) {
    const skip = page.getByRole('button', { name: 'Passer' });
    await expect(skip).toBeVisible();
    await skip.click();
  }
  await finishToHub(page);

  // Code progress is localStorage-only (no totalStars), but its events sync to Postgres.
  await pollUntil(
    () => prisma.event.count({ where: { profileId: ava.id } }),
    (c) => c > eventsBefore,
  );
});
```

- [ ] **Step 2: Verify against source FIRST.** Read `apps/kid/src/screens/CodeTurtleSession.tsx`: confirm the skip button label is `Passer` (`t('code.skip')`), that clicking it 5× reaches the summary, and that `finishToHub` (milestone-dismiss + "Accueil") works from the code summary. Confirm code truly does NOT call `queueProgress`/touch `total_stars` (so the events-not-stars assertion is right). If the 5th skip needs a different control to reach the summary, or the code summary lacks "Accueil", adjust `finishToHub`'s use here (a code-specific finish) and note it. If code content isn't playable (session won't start), STOP and report BLOCKED.

- [ ] **Step 3: Run** — `pnpm run test:e2e` (env-exported, ports clean) → code spec passes; 3× for stability. Assertion (event count increases + session completes) is the contract.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/kid-session-code.spec.ts
git commit -m "test(e2e/kid): code session completes via skip, events sync (progress is local-only)"
```

---

### Task 4: TRANSLATION session e2e (MCQ)

**Files:**
- Test: `e2e/tests/kid-session-translation.spec.ts`

**Interfaces:**
- Consumes: Task-1 helpers.

**Rule (verified):** `TranslationSession` TOTAL = 7, MCQ (same `.session-answers`/`.feedback-strip` mechanic as words/numbers). Nav: the translation MODULE tile auto-starts (NO sub-hub — one click, no sub-mode tile). Persists `totalStars`.

- [ ] **Step 1: Write the test** — `e2e/tests/kid-session-translation.spec.ts`:

```ts
import { test } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import { loginAndPickAva, avaProfile, startModule, completeMcqLesson, finishToHub } from '../helpers/kid-session';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '10.30.0.4' } });

test('translation: a full session persists stars', async ({ page }) => {
  await loginAndPickAva(page);
  const ava = await avaProfile();
  const before = ava.totalStars;

  await startModule(page, { module: 'translation' }); // no sub-hub — the module tile auto-starts
  await completeMcqLesson(page, 7);
  await finishToHub(page);

  await pollUntil(
    async () => (await prisma.childProfile.findUniqueOrThrow({ where: { id: ava.id } })).totalStars,
    (s) => s > before,
  );
});
```

- [ ] **Step 2: Verify** the translation module tile auto-starts with no sub-hub (read `apps/kid/src/App.tsx` around the translation branch, ~line 469-476) — if a sub-mode tile IS shown, add it to `startModule`. Then **Step 3: Run** `pnpm run test:e2e` (env-exported, ports clean) → all kid specs pass (offline-sync, words, keyboard, code, translation, smoke); 3× for stability. **Step 4: Commit**

```bash
git add e2e/tests/kid-session-translation.spec.ts
git commit -m "test(e2e/kid): translation session persists stars"
```

---

### Task 5: Full pipeline + PR

- [ ] **Step 1: Full local pipeline** (env exported for the e2e leg; ports clean first):

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration
lsof -ti:3000,:5173 2>/dev/null | xargs -r kill -9
DATABASE_URL=postgresql://localhost:5432/gabee_test DIRECT_URL=postgresql://localhost:5432/gabee_test \
TEST_DATABASE_URL=postgresql://localhost:5432/gabee_test AUTH_JWT_SECRET=e2e-local-secret-32-chars-minimum-xx \
pnpm run test:e2e
```
Expected: all green. **`pnpm run typecheck` MUST pass** — tsx does not typecheck, so the e2e specs' types are only checked here + in CI (a phase-4a lesson). Note the total e2e wall-clock in your report (4 new full sessions + existing specs; the CI `e2e` job caps at 30 min). Any FAILURE = STOP and report.

- [ ] **Step 2: Push and PR**

```bash
git push -u origin feature/test-session-e2e
gh pr create --base main --title "test(e2e): phase 4b — one-session-per-module kid e2e (words, keyboard, code, translation)" --body "Completes phase 4 of docs/superpowers/specs/2026-07-14-test-strategy-design.md — the Layer-4 kid 'one session per module → stars/progression persist' scenario (numbers was already covered by kid-offline-sync).

- shared e2e/helpers/kid-session.ts: login → skip device-link → pick Ava → start-module → complete-session, generalizing the proven kid-offline-sync patterns
- words (picture) + translation: MCQ brute-force, assert totalStars increases
- keyboard (static/copy): read the DOM-rendered target and type it, assert totalStars increases
- code (maze): puzzles aren't programmatically solvable, so complete via the 'Passer' (skip) button; code progress is localStorage-only (no totalStars), so assert its EVENTS sync to Postgres instead
- each spec sets its own x-forwarded-for so the 5/5min login rate-limit buckets don't bleed across the kid specs (survives CI retry)

Zero production changes. This closes phase 4; phase 5 (parent/admin surfaces) is next."
```

- [ ] **Step 3: Watch CI to green** — `gh run list --branch feature/test-session-e2e --limit 1`, then `gh run watch <id> --exit-status`. Both `check` and `e2e` jobs must pass. Iterate on failures; never fire-and-forget. (If a kid session flakes in CI but passes locally, suspect the parallel-worktree stale-server trap did NOT apply in CI — CI builds fresh — so it's a real timing/selector issue; get the trace artifact.)

---

## Self-Review (done at plan-writing time)

- **Spec coverage (phase 4b):** the Layer-4 kid "one session per module" scenario ✔ — numbers (pre-existing) + words (Task 1) + keyboard (Task 2) + code (Task 3) + translation (Task 4), each completing a real session and asserting server-side persistence (stars for the four star-syncing modules; events for code, which is localStorage-only). Words is driven via one representative sub-mode (picture); the other three words sub-modes + keyboard-scrolling + words-build are not required by "one session per module" and are noted as optional future coverage (words-build in particular needs a bundle-data lookup — deliberately out of scope).
- **Placeholders:** none — every step has runnable code/commands. Each module task names the source file to verify its selector/nav against before running, and pins the persistence assertion as the contract.
- **Type consistency:** `loginAndPickAva`/`avaProfile`/`startModule`/`completeMcqLesson`/`finishToHub` defined in Task 1, consumed unchanged in Tasks 2-4; the keyboard `typeKeyboardLesson` and code skip-loop are local to their specs; `FIXTURES` fields (`parentEmail`/`password`/`childName`) reused.
- **Known risk register:** (1) login rate-limit bleed across kid specs — mitigated by a distinct `x-forwarded-for` per spec; (2) parallel-worktree stale-server reuse locally — kill ports before each run (CI builds fresh); (3) code's events-not-stars persistence — asserted correctly (event count, not totalStars); (4) keyboard target-selector precision — Task 2 Step 2 verifies against source; (5) tsx not typechecking the specs — `typecheck` run explicitly in Task 5; (6) milestone dialog / summary-screen variance per module — `finishToHub` handles the dialog, verified per task.
