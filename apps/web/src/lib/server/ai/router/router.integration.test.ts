import '../../../../test/setup-integration';
import test, { after, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import { setErrorReporterForTests } from '../../report-error';
import { createPrismaCatalogue } from './catalogue';
import { AiRefusedError, AiUnavailableError } from './errors';
import { FakeAiAdapter } from './fake-adapter';
import { resetAiAdapters, runAiTask, setAiAdapters } from './router';
import type { AiRequest } from './types';

// Uses the DEFAULT (Prisma) catalogue: routes, prices and health come from the
// seeded test database, exactly as in production.
const prisma = createTestClient();
const OPUS = 'claude-opus-5-5';
const SONNET = 'claude-sonnet-5-5';

const Out = z.object({ title: z.string() });
const request = (over: Partial<AiRequest<typeof Out>> = {}): AiRequest<typeof Out> => ({
  task: 'content_strategy',
  system: 'You are the strategist.',
  blocks: [{ kind: 'text', label: 'brief', trusted: true, text: 'Plan the week.' }],
  schema: Out,
  origin: 'scheduled_job',
  ...over,
});

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  setErrorReporterForTests(() => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  resetAiAdapters();
  setErrorReporterForTests(null);
  mock.restoreAll();
});
after(async () => prisma.$disconnect());

async function addSonnetFallback() {
  await prisma.aiTaskRoute.create({
    data: { task: 'content_strategy', rank: 2, modelKey: SONNET, effort: 'medium', maxTokens: 8000 },
  });
}

test('router falls back on outage and records two usage rows', async () => {
  await addSonnetFallback();
  const fake = new FakeAiAdapter([{ error: 'outage' }, { json: { title: 'ok' }, inputTokens: 1000, outputTokens: 500 }]);
  setAiAdapters([fake]);

  const res = await runAiTask(request({ origin: 'user_action' }));
  assert.equal(res.modelKey, SONNET);
  assert.equal(res.costUsd, 0.007); // seeded sonnet prices: $2 / $10 per MTok
  assert.equal(fake.calls[1]?.route.effort, 'medium');
  assert.equal(fake.calls[1]?.route.maxTokens, 8000);

  const rows = await prisma.aiUsage.findMany({ orderBy: { createdAt: 'asc' } });
  assert.deepEqual(
    rows.map((r) => [r.model, r.provider, r.purpose, r.task, r.origin, r.status, r.errorCode, r.costUsd, r.inputTokens]),
    [
      [OPUS, 'anthropic', 'content_strategy', 'content_strategy', 'user_action', 'failed', 'overloaded_error', 0, 0],
      [SONNET, 'anthropic', 'content_strategy', 'content_strategy', 'user_action', 'succeeded', null, 0.007, 1000],
    ],
  );
  assert.ok(rows.every((r) => typeof r.latencyMs === 'number' && r.latencyMs >= 0));

  const opus = await prisma.aiModel.findUniqueOrThrow({ where: { key: OPUS } });
  assert.equal(opus.consecutiveFailures, 1);
  assert.equal(opus.unhealthyUntil, null);
});

test('router never falls back on refusal and records a refused row', async () => {
  await addSonnetFallback();
  const fake = new FakeAiAdapter([{ error: 'refusal', inputTokens: 50, outputTokens: 5 }, { json: { title: 'x' } }]);
  setAiAdapters([fake]);
  await assert.rejects(runAiTask(request()), AiRefusedError);
  assert.equal(fake.calls.length, 1);
  const rows = await prisma.aiUsage.findMany();
  assert.deepEqual(
    rows.map((r) => [r.model, r.status, r.errorCode, r.costUsd]),
    [[OPUS, 'refused', 'refusal', 0.0003]],
  );
});

test('invalid JSON shape records invalid_output with its cost', async () => {
  setAiAdapters([new FakeAiAdapter([{ json: { nope: true }, inputTokens: 1000, outputTokens: 1000 }])]);
  await assert.rejects(runAiTask(request()), { name: 'AiInvalidOutputError' });
  const [row] = await prisma.aiUsage.findMany();
  assert.equal(row?.status, 'invalid_output');
  assert.equal(row?.errorCode, 'schema_mismatch');
  assert.equal(row?.costUsd, 0.024);
});

test('three consecutive outages mark the model unhealthy for 5 minutes', async () => {
  setAiAdapters([new FakeAiAdapter([{ error: 'outage' }, { error: 'outage' }, { error: 'outage' }])]);
  const before = Date.now();
  for (let i = 0; i < 3; i++) await assert.rejects(runAiTask(request()), AiUnavailableError);

  const opus = await prisma.aiModel.findUniqueOrThrow({ where: { key: OPUS } });
  assert.equal(opus.consecutiveFailures, 3);
  const until = opus.unhealthyUntil?.getTime() ?? 0;
  assert.ok(until >= before + 5 * 60_000 && until <= Date.now() + 5 * 60_000);

  // Skipped while unhealthy: no call, no new usage row.
  const idle = new FakeAiAdapter([]);
  setAiAdapters([idle]);
  await assert.rejects(runAiTask(request()), (err: unknown) => {
    assert.ok(err instanceof AiUnavailableError);
    assert.deepEqual(err.reasons, [`${OPUS}: unhealthy`]);
    return true;
  });
  assert.equal(idle.calls.length, 0);
  assert.equal(await prisma.aiUsage.count(), 3);

  // Once the window has passed the model is tried again; a success resets health.
  await prisma.aiModel.update({ where: { key: OPUS }, data: { unhealthyUntil: new Date(Date.now() - 1000) } });
  setAiAdapters([new FakeAiAdapter([{ json: { title: 'back' } }])]);
  await runAiTask(request());
  const healed = await prisma.aiModel.findUniqueOrThrow({ where: { key: OPUS } });
  assert.equal(healed.consecutiveFailures, 0);
  assert.equal(healed.unhealthyUntil, null);
});

test('concurrent failure bumps are all counted (atomic increment)', async () => {
  const catalogue = createPrismaCatalogue(prisma);
  const counts = await Promise.all(Array.from({ length: 10 }, () => catalogue.bumpFailures(OPUS)));
  assert.deepEqual(
    [...counts].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  const opus = await prisma.aiModel.findUniqueOrThrow({ where: { key: OPUS } });
  assert.equal(opus.consecutiveFailures, 10);
});

test('concurrent outages through the router: every attempt counted and metered', async () => {
  setAiAdapters([new FakeAiAdapter([{ error: 'outage' }, { error: 'outage' }, { error: 'outage' }, { error: 'outage' }])]);
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => runAiTask(request())));
  assert.ok(results.every((r) => r.status === 'rejected' && r.reason instanceof AiUnavailableError));
  const opus = await prisma.aiModel.findUniqueOrThrow({ where: { key: OPUS } });
  // A request whose chain loads after the third failure skips the now-unhealthy
  // model, so 3 or 4 attempts happen — but each one is counted and metered.
  const failed = await prisma.aiUsage.count({ where: { status: 'failed' } });
  assert.ok(failed >= 3);
  assert.equal(opus.consecutiveFailures, failed);
  assert.notEqual(opus.unhealthyUntil, null);
});

test('usage rows link to their agent run and actor', async () => {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { key: 'strategist' } });
  assert.ok(agent.publishedVersionId);
  const run = await prisma.agentRun.create({
    data: {
      agentKey: 'strategist',
      agentVersionId: agent.publishedVersionId,
      origin: 'scheduled_job',
      subjectKind: 'week',
      subjectId: 'test-week',
      inputHash: 'h',
      input: {},
    },
  });
  setAiAdapters([new FakeAiAdapter([{ json: { title: 'ok' } }])]);
  await runAiTask(request({ agentRunId: run.id }));
  const [row] = await prisma.aiUsage.findMany();
  assert.equal(row?.agentRunId, run.id);
  assert.equal(row?.actorId, null);
});
