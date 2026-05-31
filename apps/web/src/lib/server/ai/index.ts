import type { AiProvider } from './provider';
import { createAnthropicProvider } from './anthropic';

let cached: AiProvider | null = null;

/** The configured AI provider (Anthropic). Lazily constructed; key checked per-call. */
export function getAiProvider(): AiProvider {
  if (!cached) cached = createAnthropicProvider();
  return cached;
}

export type { AiProvider } from './provider';
