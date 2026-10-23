import type { z } from 'zod';
import type { AiTask } from '@gabee/types';

/**
 * Content Studio AI router contracts. Model ids, prices and chains are DATA
 * (`ai_models` / `ai_task_routes`); nothing here names a model.
 */

export const AI_ORIGINS = ['scheduled_job', 'user_action', 'trial'] as const;
export type AiOrigin = (typeof AI_ORIGINS)[number];

/** Effort levels a route may set (`ai_task_routes.effort`). */
export const AI_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

export function isAiEffort(value: string): value is AiEffort {
  return (AI_EFFORTS as readonly string[]).includes(value);
}

/** `ai_usage.status` values written by the router. */
export type AiUsageStatus = 'succeeded' | 'failed' | 'refused' | 'invalid_output';

/**
 * One piece of the prompt. Untrusted text (web results, news, pasted text) is
 * fenced by the adapter and declared as data, never instructions.
 */
export type AiInputBlock =
  | { kind: 'text'; label: string; trusted: boolean; text: string }
  | { kind: 'image'; mime: string; base64: string };

export interface AiRequest<S extends z.ZodType = z.ZodType> {
  task: AiTask;
  system: string;
  blocks: AiInputBlock[];
  /** The output contract: sent to the model as a JSON schema, then enforced. */
  schema: S;
  origin: AiOrigin;
  actorId?: string;
  agentRunId?: string;
  webSearch?: { maxUses: number };
}

export interface AiResult<T> {
  output: T;
  modelKey: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  refused: false;
}

/** A catalogue model, as the router needs it. */
export interface AiModelRow {
  key: string;
  provider: string;
  capabilities: string[];
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  enabled: boolean;
  unhealthyUntil: Date | null;
}

/** A validated chain step handed to an adapter. */
export interface AiRouteRow {
  task: string;
  rank: number;
  modelKey: string;
  effort: AiEffort;
  maxTokens: number;
}

/** What an adapter returns for one provider call that got a response. */
export interface AiCallResult {
  /** Parsed JSON of the final text; `undefined` when it was not JSON (see `parseError`). */
  rawJson: unknown;
  parseError?: string;
  inputTokens: number;
  outputTokens: number;
  /** Provider stop reason; only `end_turn` can carry a valid output. */
  stopReason: string;
  refusalCategory?: string | null;
}

/**
 * A provider adapter. It throws on transport/API errors (the router classifies
 * them with `classifyAiError`) and returns a result for every response.
 */
export interface AiAdapter {
  readonly provider: string;
  /** False when the adapter cannot be used (e.g. its API key is not set). */
  isAvailable(): boolean;
  call(model: AiModelRow, route: AiRouteRow, req: AiRequest): Promise<AiCallResult>;
}

/** One `ai_usage` row — one per provider attempt. */
export interface AiUsageRecord {
  provider: string;
  model: string;
  task: AiTask;
  origin: AiOrigin;
  agentRunId: string | null;
  actorId: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: AiUsageStatus;
  errorCode: string | null;
}
