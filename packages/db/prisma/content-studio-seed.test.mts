import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AGENT_KEYS, AI_TASKS, AI_TASK_CAPABILITY, AI_CAPABILITIES } from '@gabee/types';
import {
  AI_MODEL_SEED,
  AI_ROUTE_SEED,
  PLATFORM_PROFILE_SEED,
  EDITORIAL_LINE_V1,
  agentInstructionsPath,
  loadAgentInstructions,
} from './seed-content-studio';

test('every agent key has an instruction file', () => {
  for (const key of AGENT_KEYS) {
    const file = agentInstructionsPath(key);
    assert.ok(fs.existsSync(file), `missing instruction file for agent "${key}": ${file}`);
    const body = loadAgentInstructions(key);
    assert.ok(body.trim().length > 200, `instruction file for "${key}" is too short`);
    // Every agent must be told that delimited untrusted blocks are data, and
    // that its output is only the JSON of its schema.
    assert.match(body, /untrusted/i, `"${key}" does not mention untrusted blocks`);
    assert.match(body, /JSON/, `"${key}" does not state its JSON output`);
  }
});

test('every routed task model exists in the model seed', () => {
  const modelKeys = new Set(AI_MODEL_SEED.map((m) => m.key));
  assert.ok(AI_ROUTE_SEED.length > 0, 'no routes seeded');
  for (const route of AI_ROUTE_SEED) {
    assert.ok((AI_TASKS as readonly string[]).includes(route.task), `unknown task ${route.task}`);
    assert.ok(modelKeys.has(route.modelKey), `route ${route.task}#${route.rank} targets unseeded model ${route.modelKey}`);
  }
  // Every text task the agents use is routed (rank 1); media/vision tasks are not yet.
  for (const task of AI_TASKS) {
    const routed = AI_ROUTE_SEED.some((r) => r.task === task && r.rank === 1);
    assert.equal(routed, AI_TASK_CAPABILITY[task] === 'text', `routing of ${task}`);
  }
});

test('no seeded route targets a model without the task capability', () => {
  for (const m of AI_MODEL_SEED) {
    for (const c of m.capabilities) {
      assert.ok((AI_CAPABILITIES as readonly string[]).includes(c), `model ${m.key} has unknown capability ${c}`);
    }
  }
  for (const route of AI_ROUTE_SEED) {
    const model = AI_MODEL_SEED.find((m) => m.key === route.modelKey);
    assert.ok(model, `model ${route.modelKey} missing`);
    assert.ok(
      (model.capabilities as readonly string[]).includes(AI_TASK_CAPABILITY[route.task]),
      `${route.modelKey} lacks ${AI_TASK_CAPABILITY[route.task]} for ${route.task}`,
    );
  }
});

test('platform profiles and editorial line hold only the agreed facts', () => {
  assert.deepEqual(PLATFORM_PROFILE_SEED.map((p) => p.platform).sort(), ['linkedin', 'tiktok']);
  const tiktok = PLATFORM_PROFILE_SEED.find((p) => p.platform === 'tiktok');
  assert.equal(tiktok?.mediaAspect, '9:16');
  assert.match(tiktok?.bioLink ?? '', /utm_source=tiktok&utm_medium=social&utm_content=bio/);
  assert.equal(EDITORIAL_LINE_V1.productFacts.paid_offer, null);
  assert.deepEqual(EDITORIAL_LINE_V1.productFacts.ages, { min: 6, max: 10 });
});
