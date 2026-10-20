import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import type { AiTask } from '@gabee/types';
import { setErrorReporterForTests } from '../../report-error';
import type { AiCatalogue, CatalogueRoute } from './catalogue';
import { AiInvalidOutputError, AiRefusedError, AiUnavailableError } from './errors';
import { FakeAiAdapter } from './fake-adapter';
import { createAnthropicAdapter } from './anthropic-adapter';
import { resetAiAdapters, resetAiCatalogue, runAiTask, setAiAdapters, setAiCatalogue } from './router';
import type { AiModelRow, AiRequest, AiUsageRecord } from './types';

// ── In-memory catalogue: same contract as the Prisma one, no database ──

function model(key: string, over: Partial<AiModelRow> = {}): AiModelRow {
  return {
    key,
    provider: 'anthropic',
    capabilities: ['text', 'vision'],
    inputUsdPerMTok: 4,
    outputUsdPerMTok: 20,
    enabled: true,
    unhealthyUntil: null,
    ...over,
  };
}

class MemoryCatalogue implements AiCatalogue {
  usage: AiUsageRecord[] = [];
  failures = new Map<string, number>();
  constructor(
    public models: AiModelRow[],
    public routes: CatalogueRoute[],
  ) {}
  async chain(task: AiTask) {
    return this.routes
      .filter((r) => r.task === task)
      .sort((a, b) => a.rank - b.rank)
      .map((route) => ({ route, model: this.models.find((m) => m.key === route.modelKey)! }));
  }
  async recordUsage(row: AiUsageRecord) {
    this.usage.push(row);
  }
  async bumpFailures(key: string) {
    const next = (this.failures.get(key) ?? 0) + 1;
    this.failures.set(key, next);
    return next;
  }
  async markUnhealthy(key: string, until: Date) {
    this.models.find((m) => m.key === key)!.unhealthyUntil = until;
  }
  async markHealthy(key: string) {
    this.failures.set(key, 0);
    this.models.find((m) => m.key === key)!.unhealthyUntil = null;
  }
}

function route(rank: number, modelKey: string, task: AiTask = 'content_strategy'): CatalogueRoute {
  return { task, rank, modelKey, effort: 'high', maxTokens: 16000 };
}

const Out = z.object({ title: z.string() });

function request(over: Partial<AiRequest<typeof Out>> = {}): AiRequest<typeof Out> {
  return {
    task: 'content_strategy',
    system: 'You are the strategist.',
    blocks: [{ kind: 'text', label: 'brief', trusted: true, text: 'Plan the week.' }],
    schema: Out,
    origin: 'scheduled_job',
    actorId: '00000000-0000-4000-8000-000000000001',
    agentRunId: '00000000-0000-4000-8000-000000000002',
    ...over,
  };
}

let reported: unknown[] = [];
let catalogue: MemoryCatalogue;

beforeEach(() => {
  reported = [];
  setErrorReporterForTests((err) => reported.push(err));
  mock.method(console, 'error', () => {});
  catalogue = new MemoryCatalogue(
    [model('claude-opus-5-5'), model('claude-sonnet-5-5', { inputUsdPerMTok: 2, outputUsdPerMTok: 10 })],
    [route(1, 'claude-opus-5-5'), route(2, 'claude-sonnet-5-5')],
  );
  setAiCatalogue(catalogue);
});

afterEach(() => {
  resetAiAdapters();
  resetAiCatalogue();
  setErrorReporterForTests(null);
  mock.restoreAll();
});

test('router returns validated output with tokens, cost and model', async () => {
  const fake = new FakeAiAdapter([{ json: { title: 'Rentrée' }, inputTokens: 1000, outputTokens: 500 }]);
  setAiAdapters([fake]);
  const res = await runAiTask(request());
  assert.deepEqual(res.output, { title: 'Rentrée' });
  assert.equal(res.modelKey, 'claude-opus-5-5');
  assert.equal(res.costUsd, 0.014); // 1000×4 + 500×20 per million
  assert.equal(res.refused, false);
  assert.equal(fake.calls[0]?.route.effort, 'high');
  assert.equal(fake.calls[0]?.route.maxTokens, 16000);
  assert.equal(catalogue.usage.length, 1);
  assert.deepEqual(
    { ...catalogue.usage[0], latencyMs: 0 },
    {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      task: 'content_strategy',
      origin: 'scheduled_job',
      agentRunId: '00000000-0000-4000-8000-000000000002',
      actorId: '00000000-0000-4000-8000-000000000001',
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.014,
      latencyMs: 0,
      status: 'succeeded',
      errorCode: null,
    },
  );
});

test('router falls back on outage and records two usage rows', async () => {
  const fake = new FakeAiAdapter([{ error: 'outage' }, { json: { title: 'ok' }, inputTokens: 1000, outputTokens: 500 }]);
  setAiAdapters([fake]);
  const res = await runAiTask(request());
  assert.equal(res.modelKey, 'claude-sonnet-5-5');
  assert.equal(res.costUsd, 0.007);
  assert.deepEqual(
    fake.calls.map((c) => c.model.key),
    ['claude-opus-5-5', 'claude-sonnet-5-5'],
  );
  assert.deepEqual(
    catalogue.usage.map((u) => [u.model, u.status, u.errorCode, u.costUsd]),
    [
      ['claude-opus-5-5', 'failed', 'overloaded_error', 0],
      ['claude-sonnet-5-5', 'succeeded', null, 0.007],
    ],
  );
  assert.equal(catalogue.failures.get('claude-opus-5-5'), 1);
  // The swallowed outage still reaches Sentry.
  assert.equal(reported.length, 1);
});

test('router never falls back on refusal', async () => {
  const fake = new FakeAiAdapter([
    { error: 'refusal', refusalCategory: 'cyber', inputTokens: 200, outputTokens: 10 },
    { json: { title: 'should not be reached' } },
  ]);
  setAiAdapters([fake]);
  await assert.rejects(runAiTask(request()), (err: unknown) => {
    assert.ok(err instanceof AiRefusedError);
    assert.equal(err.category, 'cyber');
    return true;
  });
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(
    catalogue.usage.map((u) => [u.model, u.status, u.errorCode, u.inputTokens]),
    [['claude-opus-5-5', 'refused', 'refusal_cyber', 200]],
  );
});

test('router never falls back on invalid_request: records, reports and rethrows', async () => {
  const fake = new FakeAiAdapter([{ error: 'invalid_request' }, { json: { title: 'x' } }]);
  setAiAdapters([fake]);
  await assert.rejects(runAiTask(request()), (err: unknown) => (err as { kind?: string }).kind === 'invalid_request');
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(
    catalogue.usage.map((u) => [u.status, u.errorCode]),
    [['failed', 'invalid_request_error']],
  );
  assert.equal(reported.length, 1);
  assert.equal(catalogue.failures.get('claude-opus-5-5') ?? 0, 0);
});

test('invalid JSON shape throws AiInvalidOutputError and records invalid_output', async () => {
  setAiAdapters([new FakeAiAdapter([{ json: { headline: 42 } }, { json: { title: 'unused' } }])]);
  await assert.rejects(runAiTask(request()), (err: unknown) => {
    assert.ok(err instanceof AiInvalidOutputError);
    assert.ok(Array.isArray(err.issues) && err.issues.length > 0);
    return true;
  });
  assert.deepEqual(
    catalogue.usage.map((u) => [u.model, u.status, u.errorCode]),
    [['claude-opus-5-5', 'invalid_output', 'schema_mismatch']],
  );
});

test('max_tokens stop and unparseable text are invalid output, not outages', async () => {
  setAiAdapters([new FakeAiAdapter([{ json: { title: 'cut' }, stopReason: 'max_tokens' }])]);
  await assert.rejects(runAiTask(request()), AiInvalidOutputError);
  setAiAdapters([new FakeAiAdapter([{ parseError: 'Unexpected token' }])]);
  await assert.rejects(runAiTask(request()), AiInvalidOutputError);
  assert.deepEqual(
    catalogue.usage.map((u) => [u.status, u.errorCode]),
    [
      ['invalid_output', 'max_tokens'],
      ['invalid_output', 'invalid_json'],
    ],
  );
});

test('three consecutive outages mark the model unhealthy for 5 minutes', async () => {
  catalogue.routes = [route(1, 'claude-opus-5-5')];
  setAiAdapters([new FakeAiAdapter([{ error: 'outage' }, { error: 'outage' }, { error: 'outage' }])]);
  const opusUntil = () => catalogue.models[0]?.unhealthyUntil ?? null;
  for (let i = 0; i < 2; i++) await assert.rejects(runAiTask(request()), AiUnavailableError);
  assert.equal(opusUntil(), null);

  const before = Date.now();
  await assert.rejects(runAiTask(request()), AiUnavailableError);
  const until = opusUntil()?.getTime() ?? 0;
  assert.ok(until >= before + 5 * 60_000 && until <= Date.now() + 5 * 60_000, 'unhealthy for ~5 minutes');

  // While unhealthy the model is skipped without a call (and without a usage row).
  const idle = new FakeAiAdapter([]);
  setAiAdapters([idle]);
  await assert.rejects(runAiTask(request()), (err: unknown) => {
    assert.ok(err instanceof AiUnavailableError);
    assert.deepEqual(err.reasons, ['claude-opus-5-5: unhealthy']);
    return true;
  });
  assert.equal(idle.calls.length, 0);
  assert.equal(catalogue.usage.length, 3);
});

test('a success resets the failure count', async () => {
  setAiAdapters([new FakeAiAdapter([{ error: 'outage' }, { json: { title: 'a' } }, { json: { title: 'b' } }])]);
  await runAiTask(request()); // opus fails, sonnet succeeds
  assert.equal(catalogue.failures.get('claude-opus-5-5'), 1);
  await runAiTask(request()); // opus succeeds
  assert.equal(catalogue.failures.get('claude-opus-5-5'), 0);
});

test('disabled, incapable and invalid-effort routes are skipped with reasons', async () => {
  catalogue.models.push(model('claude-haiku-5-5', { capabilities: ['vision'] }));
  catalogue.models[0]!.enabled = false;
  catalogue.routes = [
    route(1, 'claude-opus-5-5'),
    route(2, 'claude-haiku-5-5'),
    { ...route(3, 'claude-sonnet-5-5'), effort: 'turbo' },
  ];
  setAiAdapters([new FakeAiAdapter([])]);
  await assert.rejects(runAiTask(request()), (err: unknown) => {
    assert.ok(err instanceof AiUnavailableError);
    assert.deepEqual(err.reasons, [
      'claude-opus-5-5: disabled',
      'claude-haiku-5-5: incapable',
      'claude-sonnet-5-5: invalid_effort',
    ]);
    return true;
  });
});

test('a task without any route is unavailable', async () => {
  setAiAdapters([new FakeAiAdapter([])]);
  await assert.rejects(runAiTask(request({ task: 'report_narrative' })), (err: unknown) => {
    assert.ok(err instanceof AiUnavailableError);
    assert.deepEqual(err.reasons, ['report_narrative: no_route']);
    return true;
  });
});

test('missing ANTHROPIC_API_KEY makes the anthropic adapter unavailable, not a crash', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const adapter = createAnthropicAdapter();
    assert.equal(adapter.provider, 'anthropic');
    assert.equal(adapter.isAvailable(), false);
    // Default adapters (no override): the chain is skipped with `no_key`.
    resetAiAdapters();
    await assert.rejects(runAiTask(request()), (err: unknown) => {
      assert.ok(err instanceof AiUnavailableError);
      assert.deepEqual(err.reasons, ['claude-opus-5-5: no_key', 'claude-sonnet-5-5: no_key']);
      return true;
    });
    assert.equal(catalogue.usage.length, 0);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test('a model whose provider has no adapter is skipped', async () => {
  catalogue.models[0]!.provider = 'openai';
  setAiAdapters([new FakeAiAdapter([{ json: { title: 'from sonnet' } }])]);
  const res = await runAiTask(request());
  assert.equal(res.modelKey, 'claude-sonnet-5-5');
});
