import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AGENT_KEYS,
  AI_TASKS,
  AI_TASK_CAPABILITY,
  AI_CAPABILITIES,
  DirectionProposalsSchema,
  WeekTitlesSchema,
  LinkedInPostSchema,
  TikTokPostSchema,
  ArtDirectionSchema,
  ReportNarrativeSchema,
  type AgentKey,
} from '@gabee/types';
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

// Duck-typed walk of a zod v4 schema: every object key (any depth) and every
// enum value the model must emit. @gabee/db has no direct zod dependency.
type ZodLike = { _zod: { def: object } };
type ZodDef = { type: string; shape?: object; element?: ZodLike; innerType?: ZodLike; entries?: object };
function outputTokens(schema: ZodLike, acc = new Set<string>()): Set<string> {
  const def = schema._zod.def as ZodDef;
  switch (def.type) {
    case 'object':
      for (const [key, child] of Object.entries((def.shape ?? {}) as Record<string, ZodLike>)) {
        acc.add(key);
        outputTokens(child, acc);
      }
      break;
    case 'array':
      if (def.element) outputTokens(def.element, acc);
      break;
    case 'optional':
    case 'nullable':
      if (def.innerType) outputTokens(def.innerType, acc);
      break;
    case 'enum':
      for (const v of Object.values((def.entries ?? {}) as Record<string, string>)) acc.add(v);
      break;
    default:
      break;
  }
  return acc;
}

const AGENT_OUTPUT_SCHEMAS: Record<AgentKey, ZodLike[]> = {
  strategist: [DirectionProposalsSchema, WeekTitlesSchema],
  writer_linkedin: [LinkedInPostSchema],
  writer_tiktok: [TikTokPostSchema],
  art_director: [ArtDirectionSchema],
  analyst: [ReportNarrativeSchema],
};

test('every agent file names every field and enum value of its output schema', () => {
  for (const key of AGENT_KEYS) {
    const body = loadAgentInstructions(key);
    for (const schema of AGENT_OUTPUT_SCHEMAS[key]) {
      const tokens = outputTokens(schema);
      assert.ok(tokens.size > 0, `no fields found for ${key}`);
      for (const token of tokens) {
        assert.ok(body.includes(`"${token}"`) || body.includes(`\`${token}\``), `${key}.md never names "${token}"`);
      }
    }
  }
});


test('every seeded publish link passes the Réglages rule, and matches the migration default', async () => {
  const { publishUrlProblem } = await import('@gabee/types');
  const migration = fs.readFileSync(new URL('./migrations/20261026150000_studio_publish_links_external_media/migration.sql', import.meta.url), 'utf8');
  for (const p of PLATFORM_PROFILE_SEED) {
    assert.ok(p.publishUrl, `${p.platform} has no default publish link`);
    assert.equal(publishUrlProblem(p.platform, p.publishUrl), null, `${p.platform}: ${p.publishUrl}`);
    assert.ok(migration.includes(`'${p.publishUrl}'`), `the migration does not set ${p.publishUrl}`);
  }
  assert.equal(PLATFORM_PROFILE_SEED.find((p) => p.platform === 'linkedin')?.publishUrl, 'https://www.linkedin.com/company/109660238/admin/page-posts/published/?share=true');
});
