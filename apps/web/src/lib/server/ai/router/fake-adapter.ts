import { AiProviderError } from './errors';
import type { AiAdapter, AiCallResult, AiModelRow, AiRequest, AiRouteRow } from './types';

/** One scripted reply. `json` answers; `error` simulates a provider failure. */
export interface FakeAiStep {
  json?: unknown;
  error?: 'outage' | 'refusal' | 'invalid_request';
  refusalCategory?: string | null;
  /** Simulate non-JSON text (the adapter's `parseError`). */
  parseError?: string;
  stopReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Deterministic adapter for tests — no network. Each call consumes the next
 * step of the script, whatever model the router picked, and is recorded in
 * `calls`. Inject with `setAiAdapters([new FakeAiAdapter(script)])` and restore
 * with `resetAiAdapters()`.
 */
export class FakeAiAdapter implements AiAdapter {
  readonly calls: Array<{ model: AiModelRow; route: AiRouteRow; req: AiRequest }> = [];
  private readonly script: FakeAiStep[];

  constructor(
    script: FakeAiStep[],
    readonly provider: string = 'anthropic',
  ) {
    this.script = [...script];
  }

  isAvailable(): boolean {
    return true;
  }

  async call(model: AiModelRow, route: AiRouteRow, req: AiRequest): Promise<AiCallResult> {
    this.calls.push({ model, route, req });
    const step = this.script.shift();
    if (!step) throw new Error(`FakeAiAdapter: no scripted reply left for call ${this.calls.length}`);
    const tokens = { inputTokens: step.inputTokens ?? 100, outputTokens: step.outputTokens ?? 50 };
    switch (step.error) {
      case 'outage':
        throw new AiProviderError('outage', 'overloaded_error', 'Fake provider overloaded');
      case 'invalid_request':
        throw new AiProviderError('invalid_request', 'invalid_request_error', 'Fake invalid request');
      case 'refusal':
        return { rawJson: null, ...tokens, stopReason: 'refusal', refusalCategory: step.refusalCategory ?? null };
      default:
        if (step.parseError !== undefined) {
          return { rawJson: undefined, parseError: step.parseError, ...tokens, stopReason: step.stopReason ?? 'end_turn' };
        }
        return { rawJson: step.json, ...tokens, stopReason: step.stopReason ?? 'end_turn' };
    }
  }
}
