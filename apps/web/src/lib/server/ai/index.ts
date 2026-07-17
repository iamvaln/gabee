import type { AiProvider } from './provider';
import { createAnthropicProvider } from './anthropic';

let cached: AiProvider | null = null;

/** The configured AI provider (Anthropic). Lazily constructed; key checked per-call. */
export function getAiProvider(): AiProvider {
  if (!cached) cached = createAnthropicProvider();
  return cached;
}

/**
 * Override the provider — for tests only, so `generateQuestions` / plan streaming
 * can run against a deterministic fake instead of a live model. Production code
 * never calls this. Pair every `setAiProvider` with `resetAiProvider()` in test
 * teardown so the real provider is restored for other suites.
 */
export function setAiProvider(provider: AiProvider): void {
  cached = provider;
}

/** Clear any override (and the lazy cache), restoring the default Anthropic provider. */
export function resetAiProvider(): void {
  cached = null;
}

export type { AiProvider } from './provider';
