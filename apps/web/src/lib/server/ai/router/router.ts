import type { z } from 'zod';
import { AI_TASK_CAPABILITY } from '@gabee/types';
import { reportError } from '../../report-error';
import { createAnthropicAdapter } from './anthropic-adapter';
import { createPrismaCatalogue, type AiCatalogue, type CatalogueRoute } from './catalogue';
import { costUsd } from './cost';
import {
  AiInvalidOutputError,
  AiRefusedError,
  AiUnavailableError,
  aiErrorCode,
  classifyAiError,
} from './errors';
import {
  isAiEffort,
  type AiAdapter,
  type AiCallResult,
  type AiModelRow,
  type AiRequest,
  type AiResult,
  type AiRouteRow,
  type AiUsageRecord,
} from './types';

/** Circuit breaker: this many consecutive outages… */
const FAILURE_THRESHOLD = 3;
/** …take a model out of every chain for this long. */
const UNHEALTHY_MS = 5 * 60_000;

let adapterOverride: AiAdapter[] | null = null;
let defaultAdapters: AiAdapter[] | null = null;
let catalogueOverride: AiCatalogue | null = null;
let defaultCatalogue: Promise<AiCatalogue> | null = null;

/** Tests only: replace the provider adapters (pair with `resetAiAdapters`). */
export function setAiAdapters(adapters: AiAdapter[]): void {
  adapterOverride = adapters;
}

export function resetAiAdapters(): void {
  adapterOverride = null;
}

/** Tests only: replace the Prisma catalogue (pair with `resetAiCatalogue`). */
export function setAiCatalogue(catalogue: AiCatalogue): void {
  catalogueOverride = catalogue;
}

export function resetAiCatalogue(): void {
  catalogueOverride = null;
}

function adapters(): AiAdapter[] {
  return adapterOverride ?? (defaultAdapters ??= [createAnthropicAdapter()]);
}

function catalogue(): Promise<AiCatalogue> {
  if (catalogueOverride) return Promise.resolve(catalogueOverride);
  // Loaded on first use so this module (and its unit tests) never open the
  // database or validate env at import time.
  defaultCatalogue ??= import('../../db').then(
    ({ prisma }) => createPrismaCatalogue(prisma),
    (err: unknown) => {
      defaultCatalogue = null;
      throw err;
    },
  );
  return defaultCatalogue;
}

type Step = { ok: true; adapter: AiAdapter; route: AiRouteRow } | { ok: false; reason: string };

/** Resolve a chain step to its adapter and validated route, or say why it is skipped. */
function prepareStep(model: AiModelRow, route: CatalogueRoute, capability: string, adapters: AiAdapter[], now: number): Step {
  if (!model.enabled) return { ok: false, reason: 'disabled' };
  if (!model.capabilities.includes(capability)) return { ok: false, reason: 'incapable' };
  const { effort } = route;
  if (!isAiEffort(effort)) return { ok: false, reason: 'invalid_effort' };
  if (model.unhealthyUntil && model.unhealthyUntil.getTime() > now) return { ok: false, reason: 'unhealthy' };
  const adapter = adapters.find((a) => a.provider === model.provider);
  if (!adapter) return { ok: false, reason: 'no_adapter' };
  if (!adapter.isAvailable()) return { ok: false, reason: 'no_key' };
  return { ok: true, adapter, route: { ...route, effort } };
}

async function recordOutage(cat: AiCatalogue, modelKey: string): Promise<void> {
  const failures = await cat.bumpFailures(modelKey);
  if (failures >= FAILURE_THRESHOLD) await cat.markUnhealthy(modelKey, new Date(Date.now() + UNHEALTHY_MS));
}

/**
 * Run one AI task through its DB-configured chain.
 *
 * Walks the task's routes by rank, skipping disabled, incapable, unhealthy and
 * key-less models. Only an outage (429, 5xx/529, timeout, connection) moves on
 * to the next model; a refusal, an invalid request or an invalid output stops
 * the chain. Every attempt writes exactly one `ai_usage` row with its cost from
 * the catalogue prices.
 *
 * @throws AiRefusedError | AiInvalidOutputError | AiUnavailableError, or the
 *   provider's own error for invalid requests / auth failures.
 */
export async function runAiTask<S extends z.ZodType>(req: AiRequest<S>): Promise<AiResult<z.infer<S>>> {
  const cat = await catalogue();
  const chain = await cat.chain(req.task);
  const capability = AI_TASK_CAPABILITY[req.task];
  const providers = adapters();
  const reasons: string[] = chain.length === 0 ? [`${req.task}: no_route`] : [];

  for (const { route, model } of chain) {
    const step = prepareStep(model, route, capability, providers, Date.now());
    if (!step.ok) {
      reasons.push(`${model.key}: ${step.reason}`);
      continue;
    }

    const base = {
      provider: model.provider,
      model: model.key,
      task: req.task,
      origin: req.origin,
      agentRunId: req.agentRunId ?? null,
      actorId: req.actorId ?? null,
    };
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);

    let res: AiCallResult;
    try {
      res = await step.adapter.call(model, step.route, req);
    } catch (err) {
      const kind = classifyAiError(err);
      const errorCode = aiErrorCode(err);
      const record: AiUsageRecord = {
        ...base,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: elapsed(),
        status: kind === 'refusal' ? 'refused' : 'failed',
        errorCode,
      };
      await cat.recordUsage(record);
      const context = { scope: 'ai.router', task: req.task, model: model.key, origin: req.origin, errorCode };
      if (kind === 'outage') {
        await recordOutage(cat, model.key);
        reportError(err, { ...context, outcome: 'fallback' });
        reasons.push(`${model.key}: ${errorCode}`);
        continue;
      }
      if (kind === 'refusal') throw err instanceof AiRefusedError ? err : new AiRefusedError(null);
      reportError(err, { ...context, outcome: kind });
      throw err;
    }

    const latencyMs = elapsed();
    // The provider answered: it is up, whatever the content.
    await cat.markHealthy(model.key);
    const cost = costUsd(model, res.inputTokens, res.outputTokens);
    const usage = (status: AiUsageRecord['status'], errorCode: string | null) =>
      cat.recordUsage({
        ...base,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        costUsd: cost,
        latencyMs,
        status,
        errorCode,
      });

    if (res.stopReason === 'refusal') {
      const category = res.refusalCategory ?? null;
      await usage('refused', category ? `refusal_${category}` : 'refusal');
      throw new AiRefusedError(category);
    }
    if (res.stopReason !== 'end_turn') {
      // `max_tokens` = truncated JSON; any other stop leaves no usable answer.
      await usage('invalid_output', res.stopReason);
      throw new AiInvalidOutputError(`The AI answer was cut short (${res.stopReason}).`, { stopReason: res.stopReason });
    }
    if (res.parseError !== undefined) {
      await usage('invalid_output', 'invalid_json');
      throw new AiInvalidOutputError('The AI answer was not valid JSON.', { parseError: res.parseError });
    }
    const parsed = req.schema.safeParse(res.rawJson);
    if (!parsed.success) {
      await usage('invalid_output', 'schema_mismatch');
      throw new AiInvalidOutputError('The AI answer did not match the expected format.', parsed.error.issues);
    }

    await usage('succeeded', null);
    return {
      output: parsed.data,
      modelKey: model.key,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      costUsd: cost,
      latencyMs,
      refused: false,
    };
  }

  throw new AiUnavailableError(reasons);
}
