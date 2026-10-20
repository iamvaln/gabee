import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from '@anthropic-ai/sdk';

/**
 * How the router reacts to a failed call:
 * - `outage`: provider down / busy → record, mark health, try the next model;
 * - `refusal`: the model declined → record, stop (never retried elsewhere);
 * - `invalid_request` / `auth`: our request or credentials are wrong → record,
 *   report, rethrow (another model would fail the same way).
 */
export type AiErrorKind = 'outage' | 'refusal' | 'invalid_request' | 'auth';

/** The model declined the request (stop_reason `refusal`). Never falls back. */
export class AiRefusedError extends Error {
  override name = 'AiRefusedError';
  constructor(
    public readonly category: string | null,
    message = category ? `The AI model declined this request (${category}).` : 'The AI model declined this request.',
  ) {
    super(message);
  }
}

/** The model answered, but not with output matching the task's schema. */
export class AiInvalidOutputError extends Error {
  override name = 'AiInvalidOutputError';
  constructor(
    message: string,
    public readonly issues: unknown,
  ) {
    super(message);
  }
}

/** No model in the task's chain could be called (each reason: `<model>: <why>`). */
export class AiUnavailableError extends Error {
  override name = 'AiUnavailableError';
  constructor(public readonly reasons: string[]) {
    super(`No AI model could handle this task: ${reasons.join('; ') || 'no route'}.`);
  }
}

/**
 * A provider-neutral failure raised by adapters that are not the Anthropic SDK
 * (the fake adapter, a missing key, a future backup provider).
 */
export class AiProviderError extends Error {
  override name = 'AiProviderError';
  constructor(
    public readonly kind: AiErrorKind,
    public readonly code: string,
    message = `AI provider error: ${code}`,
  ) {
    super(message);
  }
}

/** Classify by error class, HTTP status and API error type — never by message text. */
export function classifyAiError(err: unknown): AiErrorKind {
  if (err instanceof AiProviderError) return err.kind;
  if (err instanceof AiRefusedError) return 'refusal';
  if (err instanceof APIConnectionError) return 'outage'; // includes APIConnectionTimeoutError
  if (err instanceof APIError) {
    if (err.type === 'overloaded_error' || err.type === 'rate_limit_error' || err.type === 'timeout_error') return 'outage';
    if (err instanceof RateLimitError || err instanceof InternalServerError || err instanceof ConflictError) return 'outage';
    if (err.status === 408) return 'outage';
    if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) return 'auth';
    if (err instanceof BadRequestError || err instanceof UnprocessableEntityError || err instanceof NotFoundError) {
      return 'invalid_request';
    }
  }
  // Anything else (a bug in our code, a caller abort) must not be mistaken for
  // an outage: it is rethrown, never silently retried on another model.
  return 'invalid_request';
}

/** A stable machine code for `ai_usage.error_code`. */
export function aiErrorCode(err: unknown): string {
  if (err instanceof AiProviderError) return err.code;
  if (err instanceof AiRefusedError) return 'refusal';
  if (err instanceof APIConnectionTimeoutError) return 'timeout';
  if (err instanceof APIConnectionError) return 'connection_error';
  if (err instanceof APIError) {
    if (err.type) return err.type;
    if (typeof err.status === 'number') return `http_${err.status}`;
  }
  return 'unexpected_error';
}
