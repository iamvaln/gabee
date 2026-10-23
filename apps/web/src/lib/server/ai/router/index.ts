/**
 * Content Studio AI task router — the only way Communication code calls a model.
 * Models, prices and per-task chains come from `ai_models` / `ai_task_routes`.
 * (Question authoring keeps its own seam in `../index.ts`.)
 */
export { runAiTask, setAiAdapters, resetAiAdapters, setAiCatalogue, resetAiCatalogue } from './router';
export {
  AiRefusedError,
  AiInvalidOutputError,
  AiUnavailableError,
  AiProviderError,
  AiUsageRecordError,
  classifyAiError,
  aiErrorCode,
  type AiErrorKind,
} from './errors';
export { costUsd } from './cost';
export { createAnthropicAdapter } from './anthropic-adapter';
export { createPrismaCatalogue, type AiCatalogue } from './catalogue';
export { FakeAiAdapter, type FakeAiStep } from './fake-adapter';
export {
  AI_EFFORTS,
  AI_ORIGINS,
  type AiAdapter,
  type AiEffort,
  type AiInputBlock,
  type AiOrigin,
  type AiRequest,
  type AiResult,
} from './types';
