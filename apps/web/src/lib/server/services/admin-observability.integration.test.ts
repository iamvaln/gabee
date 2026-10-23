import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { AiUsageResponseSchema } from '@gabee/types';
import { getAiUsage } from './admin-observability';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

type Row = { purpose: string; task?: string; status?: string; cost?: number; tokens?: [number, number]; model?: string };

async function usage(rows: Row[]): Promise<void> {
  await prisma.aiUsage.createMany({
    data: rows.map((r) => ({
      provider: 'anthropic',
      model: r.model ?? 'claude-opus-5-5',
      purpose: r.purpose,
      task: r.task ?? null,
      status: r.status ?? 'succeeded',
      costUsd: r.cost ?? 0,
      inputTokens: r.tokens?.[0] ?? 0,
      outputTokens: r.tokens?.[1] ?? 0,
    })),
  });
}

test('getAiUsage splits communication tasks from authoring and counts failed attempts', async () => {
  await usage([
    // Question authoring (no task): the legacy purposes.
    { purpose: 'plan_generation', cost: 0.5, tokens: [1000, 2000] },
    { purpose: 'question_generation', cost: 0.25, tokens: [500, 500] },
    // Communication: the router writes purpose = task.
    { purpose: 'post_linkedin', task: 'post_linkedin', cost: 0.1, tokens: [100, 100] },
    { purpose: 'post_linkedin', task: 'post_linkedin', status: 'failed', cost: 0 },
    { purpose: 'post_linkedin', task: 'post_linkedin', status: 'invalid_output', cost: 0.05, tokens: [50, 50] },
    { purpose: 'content_strategy', task: 'content_strategy', cost: 1, tokens: [4000, 1000] },
    { purpose: 'content_strategy', task: 'content_strategy', status: 'refused', cost: 0 },
  ]);

  const res = await getAiUsage();
  assert.equal(AiUsageResponseSchema.safeParse(res).success, true, 'the response matches the shared contract');

  // Totals per group: Communication (task set) vs question authoring.
  assert.deepEqual(res.groups.communication, { calls: 5, failed: 1, invalid_output: 1, refused: 1, cost_usd: 1.15 });
  assert.deepEqual(res.groups.authoring, { calls: 2, failed: 0, invalid_output: 0, refused: 0, cost_usd: 0.75 });

  // One line per task (or authoring purpose), communication first, by cost.
  const line = (key: string) => res.by_task.find((r) => r.key === key);
  assert.deepEqual(
    res.by_task.map((r) => [r.group, r.key]),
    [
      ['communication', 'content_strategy'],
      ['communication', 'post_linkedin'],
      ['authoring', 'plan_generation'],
      ['authoring', 'question_generation'],
    ],
  );
  assert.deepEqual(line('post_linkedin'), {
    key: 'post_linkedin',
    group: 'communication',
    calls: 3,
    succeeded: 1,
    failed: 1,
    invalid_output: 1,
    refused: 0,
    input_tokens: 150,
    output_tokens: 150,
    cost_usd: 0.15,
  });
  assert.equal(line('content_strategy')?.refused, 1);

  // The by-model table keeps each row's real purpose (a Communication task is not "question generation").
  assert.deepEqual(res.rows.map((r) => r.purpose).sort(), ['content_strategy', 'plan_generation', 'post_linkedin', 'question_generation']);
  assert.equal(res.total_calls, 7);
  assert.equal(res.total_cost_usd, 1.9);
});

test('getAiUsage is empty-safe', async () => {
  const res = await getAiUsage();
  assert.deepEqual(res.by_task, []);
  assert.deepEqual(res.groups.communication, { calls: 0, failed: 0, invalid_output: 0, refused: 0, cost_usd: 0 });
  assert.equal(res.total_calls, 0);
});
