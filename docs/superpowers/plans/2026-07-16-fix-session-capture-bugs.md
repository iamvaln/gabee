# Session-Capture Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three real product bugs the test strategy surfaced: (A) keyboard-earned stars never persist (server evidence cap ignores typing), (B) the parent classify flow double-submits on a re-enable race, and (C) code exercises aren't captured server-side (no star/progress sync, and the parent Code-analytics `code_level_solved` event is defined + consumed but never emitted → every kid shows 0 solved puzzles).

**Architecture:** All three are anti-tamper / progress-capture gaps, and A + C converge on one server function (`countEvidencedStars` in `progress.ts`, which caps a client's `total_stars` claim by counting only `question_answered` evidence). The fix widens that evidence to include keyboard's `typing_word_completed` and code's `code_level_solved`; wires `CodeTurtleSession` to emit `code_level_solved` and to sync progress like the other modules (`code` already has a server `TrackProgress` slot + generic merge — no schema/migration); and closes the classify re-enable window (client) + makes the classify write idempotent (server). Real product code — every fix ships with a test that fails before and passes after.

**Tech Stack:** Next.js (parent/API), React (kid PWA), Prisma/Postgres, node:test + tsx (unit/integration), Playwright (e2e). `@gabee/db/testing` factories.

## Global Constraints

- **Never add `Co-Authored-By`/AI-attribution trailers to commits or PR bodies** (user rule).
- **This is a PRODUCT-CODE fix branch** (unlike the test-only phases). Each behavioral change is proven by a test that would fail on `main` and passes after the fix (TDD where practical).
- **No DB migration** — the server `code` progress slot (`ProgressByModuleSchema.code`) and `mergeProgressByModule`'s `code` handling already exist. If you find yourself needing a schema/migration, STOP and report — the plan asserts none is required.
- **Trust model is unchanged** by the evidence widening: the star cap already counts self-reported client telemetry (`question_answered`); adding `typing_word_completed`/`code_level_solved` counts the same class of self-reported events. Do not add "validation" that the cap never had.
- **`typecheck` MUST pass** before any "green" claim — tsx does not typecheck (a prior lesson); run `pnpm run typecheck` explicitly.
- Kid UI is FRENCH; the classify flow strings are French. Integration tests use `*.integration.test.ts` against `gabee_test` (`--test-concurrency=1`, `resetDb` per test); kid unit/DOM tests follow the existing kid conventions.
- Node 20, pnpm, repo root = worktree root. Branch `fix/session-capture-bugs` (already created off `origin/main`).
- Findings reference: `.superpowers/sdd/findings.md` (exact file:line for every bug).

---

### Task 0: Branch

- [ ] **Step 1:** Worktree/branch `fix/session-capture-bugs` off `origin/main` (already created; verify `git status -sb`). Fresh worktree already has `packages/db/.env` + `prisma generate` done.

---

### Task 1: Server star-cap evidence widening (fixes keyboard stars + unblocks code stars)

**Files:**
- Modify: `apps/web/src/lib/server/services/progress.ts` (`countEvidencedStars`, ~lines 45-54)
- Modify: `packages/db/src/testing.ts` (add `seedTypedWords` + `seedCodeSolved` factories, next to `seedCorrectAnswers` ~line 87)
- Test: `apps/web/src/lib/server/services/progress.integration.test.ts` (add cases)

**Interfaces:**
- Consumes: existing `syncProgress`, `createTestClient`/`resetDb`/`createParent`/`createChild`/`seedCorrectAnswers` from `@gabee/db/testing`.
- Produces: `seedTypedWords(prisma, profileId, count, mode?)` and `seedCodeSolved(prisma, profileId, count)` factories (Tasks 3-4 e2e do NOT need them; Task 2 kid test does not need them — they're for this task's integration coverage).

**Rule to encode (verified):** `countEvidencedStars` returns `count(question_answered where correct=true) + sum(claimed gifts) + baseline`, used at `progress.ts:100/115` as `totalStars = max(cur, min(claim, cap))`. Keyboard emits `typing_word_completed` (static: always a correct word; scrolling: emitted on misses too, gated by payload `completed_before_timeout`). Code will emit `code_level_solved` (one per solved puzzle). Both must count as evidence.

- [ ] **Step 1: Read the current function + the two event shapes.** Read `progress.ts:40-55` (countEvidencedStars) and confirm the `question_answered` query uses `payload: { path: ['correct'], equals: true }`. Read `apps/kid/src/screens/KeyboardStaticSession.tsx` (the `typing_word_completed` emit: payload has `mode: 'static'`, no `completed_before_timeout`) and `KeyboardScrollingSession.tsx` (payload has `mode: 'scrolling'`, `completed_before_timeout: boolean`). Confirm `packages/types/src/events.ts` `CodeLevelSolvedEvent` name is `'code_level_solved'`.

- [ ] **Step 2: Add the factories** to `packages/db/src/testing.ts` (mirror `seedCorrectAnswers`'s shape — read it first for the exact `event.createMany` fields: `eventId`, `profileId`, `name`, `clientTs`, `payload`):

```ts
export async function seedTypedWords(
  prisma: PrismaClient,
  profileId: string,
  count: number,
  mode: 'static' | 'scrolling' = 'static',
): Promise<void> {
  if (count <= 0) return;
  await prisma.event.createMany({
    data: Array.from({ length: count }, () => ({
      eventId: randomUUID(),
      profileId,
      name: 'typing_word_completed',
      clientTs: new Date(),
      payload: (mode === 'static'
        ? { mode: 'static' }
        : { mode: 'scrolling', completed_before_timeout: true }) as Prisma.InputJsonValue,
    })),
  });
}

export async function seedCodeSolved(prisma: PrismaClient, profileId: string, count: number): Promise<void> {
  if (count <= 0) return;
  await prisma.event.createMany({
    data: Array.from({ length: count }, () => ({
      eventId: randomUUID(),
      profileId,
      name: 'code_level_solved',
      clientTs: new Date(),
      payload: {} as Prisma.InputJsonValue,
    })),
  });
}
```

(Match the exact imports/`randomUUID`/`Prisma` already used in `testing.ts`. If `seedCorrectAnswers` includes more required Event columns, include them identically.)

- [ ] **Step 3: Write the failing tests** — append to `progress.integration.test.ts` (read the file's header imports + the existing "bounded by counted evidence" test ~line 84 to match style):

```ts
test('keyboard typing evidence (typing_word_completed) counts toward the star cap', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  await seedTypedWords(prisma, child.id, 7); // 7 correct static words, zero question_answered
  const res = await syncProgress(parent.id, { profile_id: child.id, total_stars: 7 } as never);
  assert.equal(res.total_stars, 7); // claim is NOT clamped to 0
});

test('a scrolling miss (completed_before_timeout:false) is not star evidence', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  await seedTypedWords(prisma, child.id, 5, 'scrolling'); // 5 successes
  await prisma.event.createMany({
    data: Array.from({ length: 2 }, () => ({
      eventId: randomUUID(), profileId: child.id, name: 'typing_word_completed', clientTs: new Date(),
      payload: { mode: 'scrolling', completed_before_timeout: false } as never,
    })),
  });
  const res = await syncProgress(parent.id, { profile_id: child.id, total_stars: 7 } as never);
  assert.equal(res.total_stars, 5); // misses excluded → cap is 5
});

test('code_level_solved events count toward the star cap', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  await seedCodeSolved(prisma, child.id, 4);
  const res = await syncProgress(parent.id, { profile_id: child.id, total_stars: 4 } as never);
  assert.equal(res.total_stars, 4); // not clamped
});
```

(Import `seedTypedWords`, `seedCodeSolved`, and `randomUUID` from `node:crypto` in the test file.)

- [ ] **Step 4: Run — RED.** `pnpm --filter @gabee/web run test:integration` → the three new tests FAIL (claims clamped to 0/5-with-misses-counted). This proves the bug exists.

- [ ] **Step 5: Fix `countEvidencedStars`** — widen the evidence:

```ts
const [correctAnswers, typedWords, codeSolved, gifted] = await Promise.all([
  tx.event.count({
    where: { profileId, name: 'question_answered', payload: { path: ['correct'], equals: true } },
  }),
  tx.event.count({
    where: {
      profileId,
      name: 'typing_word_completed',
      OR: [
        { payload: { path: ['mode'], equals: 'static' } },
        { payload: { path: ['completed_before_timeout'], equals: true } },
      ],
    },
  }),
  tx.event.count({ where: { profileId, name: 'code_level_solved' } }),
  tx.kidGift.aggregate({ where: { childId: profileId, status: 'claimed' }, _sum: { amount: true } }),
]);
return correctAnswers + typedWords + codeSolved + (gifted._sum.amount ?? 0) + baseline;
```

Also update the function's doc comment (~line 27-37) which currently claims "every answer emits a question_answered event" — note that keyboard (`typing_word_completed`) and code (`code_level_solved`) are also evidence.

- [ ] **Step 6: Run — GREEN.** `pnpm --filter @gabee/web run test:integration` → all pass (new 3 + existing). Then `pnpm --filter @gabee/web run test` (unit unchanged) + `pnpm run typecheck`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/server/services/progress.ts packages/db/src/testing.ts apps/web/src/lib/server/services/progress.integration.test.ts
git commit -m "fix(progress): count keyboard typing + code-solved events as star evidence (were clamped to 0)"
```

---

### Task 2: Code exercise capture (kid) — emit code_level_solved + sync progress/stars

**Files:**
- Modify: `apps/kid/src/screens/CodeTurtleSession.tsx` (emit `code_level_solved` on solve; add `persistProgress` calling `sync.queueProgress` + `total_stars`; call it from `finishLesson`)
- Test: `apps/kid/src/screens/CodeTurtleSession.capture.test.tsx` (DOM suite) — drive a solved lesson, assert the sync + event

**Interfaces:**
- Consumes: `sync.queueProgress` (mockable, see `apps/kid/src/lib/sync.drain.test.tsx` for the `mock.method(sync, 'queueProgress', ...)` pattern), `enqueueEvent`, `setProfile`.
- Produces: nothing downstream (Task 4 e2e stays skip-based; Task 3 keyboard e2e is independent).

**Parity target:** read `apps/kid/src/screens/KeyboardStaticSession.tsx` `persistProgress` (~168-234) — it updates `profile.progress_by_module.<module>` (with a `bySubMode` extension), sets `total_stars = profile.total_stars + correctCount`, `setProfile(...)`, then `await sync.queueProgress({ profile_id, updated_at, progress_by_module, total_stars })`. Mirror this for code, keyed by the code `world`/sub-mode. KEEP the existing `persistLocal(stars)` call (it drives per-world level gating) — the sync is ADDITIVE.

**The dead event:** read `packages/types/src/events.ts` `CodeLevelSolvedEvent` (~208-220) for its exact fields (`total_attempts`, `final_blocks_used`, `optimal_blocks`, `efficiency_ratio`, `used_loop`, `used_conditional`, `total_wall_hits`, `hints_used`, `duration_ms`) and read `CodeTurtleSession.tsx`'s `startRun`/solve-success branch (~306-317, where `code_run` is emitted with `result: 'success'`) — that success branch is where a puzzle is solved. Emit `code_level_solved` there, computing the fields from the state the component already tracks (attempts ref, program length, the puzzle's optimal blocks, wall hits, duration). If a field genuinely can't be computed from available state, set it to a sensible default (e.g. `hints_used: 0`) and note it — do NOT invent state.

- [ ] **Step 1: Write the failing DOM test** — `CodeTurtleSession.capture.test.tsx` (follow the kid DOM-suite convention: first import `'../test/setup-dom'`; render the component with a seeded bundle whose level-1 lesson-1 first question has a KNOWN simple `answer` program; drive the block palette to build that program; click "▶ Lancer" (`t('code.run')`); repeat/finish to `finishLesson`). Mock `sync.queueProgress` and the event queue. Assert:

```tsx
// (skeleton — adapt selectors/props to the real component + a minimal seeded bundle)
import '../test/setup-dom';
import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { sync } from '../lib/sync';
// ... render CodeTurtleSession with a bundle where q.answer is e.g. [{op:'move',dir:'right'}], drive+run, finish ...

test('a solved code lesson syncs progress (stars + code track) and emits code_level_solved', async () => {
  const queued: unknown[] = [];
  mock.method(sync, 'queueProgress', async (body: unknown) => { queued.push(body); return {}; });
  // ... drive one solved puzzle through the lesson to finishLesson ...
  assert.equal(queued.length >= 1, true);
  const body = queued[0] as { total_stars: number; progress_by_module: { code: unknown } };
  assert.ok(body.total_stars > 0);           // claims stars for the solve
  assert.ok(body.progress_by_module.code);    // code track present in the sync payload
  // and assert a code_level_solved event was enqueued (via the event-queue mock)
});
```

Because driving the full turtle UI in jsdom is the hard part, the implementer may instead (if full-component rendering proves impractical in the DOM suite) test the extracted persist/emit logic directly at the unit level — BUT the assertions (queueProgress called with a `code` track + `total_stars > 0`; a `code_level_solved` event emitted per solve) are the contract and must hold. Document which approach was used. If neither is feasible without restructuring production code beyond the fix, STOP and report.

- [ ] **Step 2: Run — RED.** The test fails: today `finishLesson` only calls `persistLocal`, never `queueProgress`, and no `code_level_solved` is emitted.

- [ ] **Step 3: Implement.** In `CodeTurtleSession.tsx`: (a) emit `code_level_solved` in the solve-success branch; (b) add a `persistProgress(finalScore)` mirroring KeyboardStaticSession's (code `world` as the `bySubMode` key, `total_stars += finalScore`, `setProfile`, `await sync.queueProgress`); (c) call `persistProgress(finalScore)` from `finishLesson` (alongside the existing `persistLocal(stars)` — do not remove local persistence). Match the existing `ctx`/event-enqueue and `queueProgress` body shape used by the other sessions exactly.

- [ ] **Step 4: Run — GREEN.** The test passes. Then the full kid suites: `pnpm --filter @gabee/kid run test && pnpm --filter @gabee/kid run test:dom` + `pnpm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/kid/src/screens/CodeTurtleSession.tsx apps/kid/src/screens/CodeTurtleSession.capture.test.tsx
git commit -m "fix(kid/code): sync code progress+stars and emit code_level_solved (was localStorage-only; dashboard showed 0 solved)"
```

---

### Task 3: E2E — assert keyboard + code stars/capture now land

**Files:**
- Modify: `e2e/tests/kid-session-keyboard.spec.ts` (add a `totalStars` assertion; drop the stale "stars can't be asserted" header block)
- Modify: `e2e/tests/kid-session-code.spec.ts` (keep the skip-based flow; the skip path scores 0 so it CANNOT assert a star increase — instead tighten to assert the code session's `lesson_completed` (module=code) synced, as it already does; add a comment that the star path is covered by Task 1 integration + Task 2 kid test, since skip=0 stars)

**Interfaces:**
- Consumes: the running kid/web servers, `prisma`, `pollUntil`, `avaProfile`, `seedKidAuthAndPickAva` from the e2e helpers.
- Produces: nothing.

- [ ] **Step 1: Keyboard e2e — assert stars.** In `kid-session-keyboard.spec.ts`: read Ava's `totalStars` before, run the static session (types 7 single-letter prompts → 7 solved words → 7 stars now that Task 1 counts `typing_word_completed`), then add:

```ts
await pollUntil(
  async () => (await prisma.childProfile.findUniqueOrThrow({ where: { id: ava.id } })).totalStars,
  (s) => s > before,
);
```
Keep the existing `typing_keystroke` events assertion too. Delete the now-stale multi-line header comment that says stars can't be asserted (it referenced the bug this PR fixes).

- [ ] **Step 2: Code e2e — keep it honest.** In `kid-session-code.spec.ts`: the flow completes via the "Passer" skip (score 0), so `total_stars` does NOT increase — do NOT add a star assertion here (it would never pass / would be false). Keep the existing scoped assertion (code's own `lesson_completed` event synced). Update the header comment to say: star/`code_level_solved` capture (the Task 1/2 fix) is proven by the kid component test + server integration test; this e2e proves the skip-completion + lesson_completed sync. (No behavioral change to this spec beyond the comment — it stays green.)

- [ ] **Step 3: Run** — env-exported, kill stale servers first:

```bash
lsof -ti:3000,:5173 2>/dev/null | xargs -r kill -9
DATABASE_URL=postgresql://localhost:5432/gabee_test DIRECT_URL=postgresql://localhost:5432/gabee_test \
TEST_DATABASE_URL=postgresql://localhost:5432/gabee_test AUTH_JWT_SECRET=e2e-local-secret-32-chars-minimum-xx \
pnpm run test:e2e
```
Expected: all specs pass — keyboard now asserts stars increase (the Task-1 fix makes it real), code stays green. Run the keyboard spec 3× (stars-timing stability). If keyboard stars still don't increase, the Task-1 evidence fix or the keyboard claim is wrong — STOP and report.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/kid-session-keyboard.spec.ts e2e/tests/kid-session-code.spec.ts
git commit -m "test(e2e/kid): keyboard session now asserts stars persist; code e2e comment reflects capture coverage"
```

---

### Task 4: Classify double-submit race (client + server idempotency)

**Files:**
- Modify: `apps/web/src/app/parent/classify/classify-flow.tsx` (`choose` — close the re-enable window + re-entrancy guard)
- Modify: `apps/web/src/lib/server/services/classifications.ts` (`updateMany` where — add `label: null`)
- Test: `apps/web/src/lib/server/services/classifications.integration.test.ts` (new — idempotency)

**Interfaces:**
- Consumes: `classifySessions` (the service fn — confirm its exact name/signature by reading `classifications.ts`), `createParent`/`createChild` factories, `prisma.sessionClassification`/`prisma.familyActivityLog`.
- Produces: nothing.

**Findings:** `choose` (classify-flow.tsx ~176-211) clears `submitting` in `finally` immediately on POST-resolve, but `advance()` is `setTimeout(...,260)` — a ~260ms window where the already-submitted card is re-clickable → duplicate POST of the same `session_id`. Server `updateMany` (classifications.ts ~51) lacks the `label: null` guard the adjacent `firstClassificationAt` write has, so the 2nd submit succeeds (`count>0`) → duplicate `family_activity_log` insert (route.ts records activity whenever `classified.length>0`) + double `advance()` skips the next session.

- [ ] **Step 1: Write the failing server integration test** — `classifications.integration.test.ts` (follow `consent.integration.test.ts` for the exact `*.integration.test.ts` skeleton: `import '../../../test/setup-integration'` first, node:test, `createTestClient`/`resetDb`/`createParent`/`createChild`):

```ts
test('re-classifying an already-classified session is a no-op (idempotent)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const sessionId = randomUUID();
  await prisma.sessionClassification.create({
    data: { sessionId, profileId: child.id, startedAt: new Date(), label: null },
  });

  const first = await classifySessions(parent.id, [{ session_id: sessionId, label: 'child_initiated' }], null);
  assert.equal(first.length, 1); // first submit lands

  const second = await classifySessions(parent.id, [{ session_id: sessionId, label: 'prompted' }], null);
  assert.equal(second.length, 0); // second submit is a no-op — nothing re-classified

  const row = await prisma.sessionClassification.findUniqueOrThrow({ where: { sessionId } });
  assert.equal(row.label, 'child_initiated'); // label NOT overwritten by the racing 2nd submit
});
```

(Confirm the service export name (`classifySessions`?) and arg shape by reading `classifications.ts` — align the call, keep the assertions.)

- [ ] **Step 2: Run — RED.** The `second.length === 0` and label-unchanged assertions FAIL today (the 2nd submit currently succeeds and overwrites).

- [ ] **Step 3: Fix the server** — in `classifications.ts` `updateMany` where-clause, add `label: null`:

```ts
where: { sessionId: item.session_id, profileId: { in: ids }, label: null },
```

- [ ] **Step 4: Run — server GREEN.** `pnpm --filter @gabee/web run test:integration` → the new test passes; existing pass.

- [ ] **Step 5: Fix the client** — in `classify-flow.tsx` `choose`: add `if (!current || submitting) return;` at the top; remove the `finally { setSubmitting(false); }`; on the success path move `setSubmitting(false)` INTO the `setTimeout` after `advance()`; on the `catch` path call `setSubmitting(false)` immediately (retry needs the buttons back). Add `submitting` to the `useCallback` deps. (Match the exact current code — read it first.)

```tsx
if (!current || submitting) return;
setSel(label);
setSubmitting(true);
setErrorMsg(null);
try {
  const res = await fetch('/api/classifications', { /* unchanged */ });
  if (!res.ok) { /* unchanged throw */ }
  setClassifiedKidIds((arr) => /* unchanged */);
  router.refresh();
  // Keep buttons disabled until the NEXT card mounts — closes the ~260ms
  // window where the just-submitted card was re-clickable (double-submit race).
  setTimeout(() => { advance(); setSubmitting(false); }, 260);
} catch (e) {
  setErrorMsg(e instanceof Error ? e.message : /* existing fallback */);
  setSel(null);
  setSubmitting(false); // error path re-enables immediately for retry
}
```

- [ ] **Step 6: Run — full.** `pnpm --filter @gabee/web run typecheck` + `pnpm run lint`. The classify e2e (`e2e/tests/parent/classify.spec.ts`) must still pass — run it (its defensive retry loop still works with the tightened timing, but verify): `pnpm run test:e2e` (env-exported, ports killed).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/parent/classify/classify-flow.tsx apps/web/src/lib/server/services/classifications.ts apps/web/src/lib/server/services/classifications.integration.test.ts
git commit -m "fix(classify): idempotent classification write + close client re-enable window (double-submit → dup activity log)"
```

---

### Task 5: Full pipeline + PR

- [ ] **Step 1: Full local pipeline** (env exported for e2e; ports killed first):

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration
lsof -ti:3000,:5173 2>/dev/null | xargs -r kill -9
DATABASE_URL=postgresql://localhost:5432/gabee_test DIRECT_URL=postgresql://localhost:5432/gabee_test \
TEST_DATABASE_URL=postgresql://localhost:5432/gabee_test AUTH_JWT_SECRET=e2e-local-secret-32-chars-minimum-xx \
pnpm run test:e2e
```
Expected: all green. Any FAILURE = STOP and report.

- [ ] **Step 2: Push and PR**

```bash
git push -u origin fix/session-capture-bugs
gh pr create --base main --title "fix: session-capture bugs — keyboard/code stars, code dashboard event, classify double-submit" --body "Fixes three product bugs surfaced by the phase-2/4 test strategy.

**A. Keyboard & code stars never persisted.** The server star cap (\`countEvidencedStars\`) counted only \`question_answered\` events as evidence, so keyboard (\`typing_word_completed\`) and code (\`code_level_solved\`) star claims were clamped back to zero every sync. Widened the evidence to include both (scrolling misses excluded via \`completed_before_timeout\`). Trust model unchanged — same self-reported telemetry.

**B. Code exercises weren't captured server-side.** \`CodeTurtleSession\` only wrote localStorage — no \`queueProgress\`, no \`total_stars\`, so code progress was invisible to the parent and didn't survive a device change. Also, the \`code_level_solved\` event is defined and consumed by the parent Code-analytics tab but was NEVER emitted, so every kid showed 0 solved puzzles. Now emits \`code_level_solved\` per solve and syncs progress+stars like the other modules (the server \`code\` track + merge already existed — no migration).

**C. Classify double-submit race.** A ~260ms window re-enabled the just-submitted card before it advanced, and the server write wasn't idempotent → duplicate \`family_activity_log\` rows + a skipped next session + last-write-wins label overwrite. Closed the client window + added a re-entrancy guard, and made the server \`updateMany\` idempotent (\`label: null\` guard).

Each fix ships a test that fails on main and passes here (server integration for A/C, kid component for B, and the keyboard e2e now asserts stars persist). Zero DB migrations." 
```

- [ ] **Step 3: Watch CI to green** — `gh run list --branch fix/session-capture-bugs --limit 1`, then `gh run watch <id> --exit-status`. Both `check` and `e2e` must pass. Iterate; never fire-and-forget.

---

## Self-Review (done at plan-writing time)

- **Bug coverage:** A (keyboard star-cap) — Task 1 (server evidence) + Task 3 (keyboard e2e now asserts stars). B (code capture) — Task 2 (emit `code_level_solved` + sync progress/stars) + Task 1 (code evidence in the cap). C (classify race) — Task 4 (client window + server idempotency). All three have a failing-then-passing test. The dead-`code_level_solved`/dashboard-0-solved sub-bug is fixed by Task 2's emit + Task 1's evidence.
- **Placeholders:** the two spots needing source-reading (the code `persistProgress` mirror + `code_level_solved` field computation in Task 2; the exact `classifySessions` export name in Task 4) each name the parity file to read and pin the assertions as the contract — not open-ended.
- **Type consistency:** `seedTypedWords`/`seedCodeSolved` defined in Task 1 and used only there; the widened `countEvidencedStars` returns the same `number`; the `code` track shape reuses `TrackProgress` (no new type).
- **Known risk register:** (1) code `total_stars` can't be asserted via the skip-based e2e (skip=0 score) — covered by kid component + server integration instead (Task 3 Step 2 makes this explicit, doesn't fake it); (2) driving the turtle UI in a DOM test may be heavy — Task 2 Step 1 allows a narrower unit on the persist/emit logic with the same contract; (3) the classify e2e's existing defensive retry loop must still pass under the tightened timing — Task 4 Step 6 verifies; (4) no migration — asserted in Global Constraints, STOP if one seems needed.
