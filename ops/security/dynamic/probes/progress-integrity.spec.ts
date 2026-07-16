import { test, expect, request as apiRequest } from '@playwright/test';
import { login, TESTERS } from '../probe-lib';

/**
 * `total_stars` is CLIENT-DECLARED — the kid app computes it on-device and syncs the
 * total — so it is a claim, not a fact. Monotonic-max alone only stopped it going
 * DOWN, which meant a tampered client could POST `total_stars: 999999` and have it
 * stored (first sweep, finding #8). Stars feed the gift/reward economy, so that
 * converted devtools into real-world rewards.
 *
 * The server now bounds the claim by evidence it can count itself: correct
 * `question_answered` events (1 star = 1 correct answer, the rule every star-awarding
 * screen implements) + claimed gifts + a grandfathered baseline for stars that
 * predate the rule.
 *
 * NOTE: local data cannot be made tamper-proof — encryption would need its key on the
 * client. The boundary is the server, which is why this is enforced here and pinned
 * here.
 */

const SESSION = '11111111-1111-4111-8111-111111111111';

/** One `question_answered` event. `correct: false` must NOT earn a star. */
function answer(kidId: string, n: number, correct: boolean) {
  return {
    event_id: `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`,
    profile_id: kidId,
    session_id: SESSION,
    client_ts: new Date().toISOString(),
    event: {
      name: 'question_answered',
      module: 'numbers',
      level: 1,
      lesson: 1,
      question_id: `num-l1-l1-${n}`,
      correct,
      selected_option: 1,
      response_time_ms: 1200,
      attempt_num: 1,
    },
  };
}

test('a client cannot declare stars it has no evidence for', async ({ baseURL }) => {
  // Own bucket: this spec logs in, and the login limiter is 5/5min per IP.
  const ctx = await apiRequest.newContext({
    baseURL,
    extraHTTPHeaders: { 'x-forwarded-for': '10.99.3.1' },
  });
  const token = await login(ctx, TESTERS.B.email, TESTERS.B.password);
  const auth = { authorization: `Bearer ${token}` };

  const profiles = await ctx.get('/api/profiles', { headers: auth });
  const kidId: string = (await profiles.json()).profiles[0].id;

  // The attack: a fresh profile with no correct answers claims a fortune.
  const cheat = await ctx.post('/api/progress/sync', {
    headers: auth,
    data: { profile_id: kidId, updated_at: new Date().toISOString(), total_stars: 999999 },
  });
  expect(cheat.status()).toBe(200);
  const cheated = (await cheat.json()).total_stars;
  expect(cheated, 'unevidenced stars must not be stored').toBeLessThan(999999);

  // The control that matters: real play must still earn. 3 correct + 1 wrong = 3.
  const ingest = await ctx.post('/api/events', {
    headers: auth,
    data: { events: [answer(kidId, 1, true), answer(kidId, 2, true), answer(kidId, 3, true), answer(kidId, 4, false)] },
  });
  expect(ingest.status(), 'events ingest').toBe(200);

  const legit = await ctx.post('/api/progress/sync', {
    headers: auth,
    data: { profile_id: kidId, updated_at: new Date().toISOString(), total_stars: cheated + 3 },
  });
  expect((await legit.json()).total_stars, 'legitimate play must still earn stars').toBe(cheated + 3);

  // Over-claiming beyond the evidence is clamped, not stored.
  const over = await ctx.post('/api/progress/sync', {
    headers: auth,
    data: { profile_id: kidId, updated_at: new Date().toISOString(), total_stars: cheated + 50 },
  });
  expect((await over.json()).total_stars, 'over-claim is clamped to the evidence').toBe(cheated + 3);

  await ctx.dispose();
});

test('progress sync still refuses another family entirely', async ({ baseURL }) => {
  // The evidence cap bounds how MUCH a client can claim; ownership still bounds WHOSE
  // profile it may claim for. Regressing either is a block-tier finding.
  const ctxA = await apiRequest.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '10.99.3.2' } });
  const ctxB = await apiRequest.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '10.99.3.3' } });
  const tokenA = await login(ctxA, TESTERS.A.email, TESTERS.A.password);
  const tokenB = await login(ctxB, TESTERS.B.email, TESTERS.B.password);

  const bKids = await ctxB.get('/api/profiles', { headers: { authorization: `Bearer ${tokenB}` } });
  const bKidId: string = (await bKids.json()).profiles[0].id;

  const r = await ctxA.post('/api/progress/sync', {
    headers: { authorization: `Bearer ${tokenA}` },
    data: { profile_id: bKidId, updated_at: new Date().toISOString(), total_stars: 1000 },
  });
  expect(r.status(), "A must not sync B's kid").toBe(404);

  await ctxA.dispose();
  await ctxB.dispose();
});
