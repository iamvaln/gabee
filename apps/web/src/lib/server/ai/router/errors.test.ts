import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from '@anthropic-ai/sdk';
import { AiProviderError, AiRefusedError, aiErrorCode, classifyAiError } from './errors';

/** Build the SDK error exactly as the client does from an HTTP response. */
function httpError(status: number, type: string): APIError {
  return APIError.generate(status, { type: 'error', error: { type, message: 'x' } }, undefined, new Headers());
}

test('classifyAiError maps 429/500/529/connection to outage, 400 to invalid_request', () => {
  const rateLimited = httpError(429, 'rate_limit_error');
  assert.ok(rateLimited instanceof RateLimitError);
  assert.equal(classifyAiError(rateLimited), 'outage');

  const serverError = httpError(500, 'api_error');
  assert.ok(serverError instanceof InternalServerError);
  assert.equal(classifyAiError(serverError), 'outage');

  const overloaded = httpError(529, 'overloaded_error');
  assert.equal(classifyAiError(overloaded), 'outage');
  assert.equal(aiErrorCode(overloaded), 'overloaded_error');

  assert.equal(classifyAiError(new APIConnectionError({ message: 'socket hang up' })), 'outage');
  assert.equal(classifyAiError(new APIConnectionTimeoutError()), 'outage');
  assert.equal(aiErrorCode(new APIConnectionTimeoutError()), 'timeout');
  assert.equal(aiErrorCode(new APIConnectionError({ message: 'reset' })), 'connection_error');

  const badRequest = httpError(400, 'invalid_request_error');
  assert.ok(badRequest instanceof BadRequestError);
  assert.equal(classifyAiError(badRequest), 'invalid_request');
  assert.equal(aiErrorCode(badRequest), 'invalid_request_error');
});

test('classifyAiError: 422 and 404 are invalid requests, 401/403 are auth', () => {
  const unprocessable = httpError(422, 'invalid_request_error');
  assert.ok(unprocessable instanceof UnprocessableEntityError);
  assert.equal(classifyAiError(unprocessable), 'invalid_request');

  const notFound = httpError(404, 'not_found_error');
  assert.ok(notFound instanceof NotFoundError);
  assert.equal(classifyAiError(notFound), 'invalid_request');

  const unauthenticated = httpError(401, 'authentication_error');
  assert.ok(unauthenticated instanceof AuthenticationError);
  assert.equal(classifyAiError(unauthenticated), 'auth');

  const forbidden = httpError(403, 'permission_error');
  assert.ok(forbidden instanceof PermissionDeniedError);
  assert.equal(classifyAiError(forbidden), 'auth');
});

test('classifyAiError: an overloaded_error body is an outage whatever its status', () => {
  const overloadedOdd = new APIError(418, { type: 'error' }, 'teapot', new Headers(), 'overloaded_error');
  assert.equal(classifyAiError(overloadedOdd), 'outage');
});

test('classifyAiError: typed router errors and unknown errors', () => {
  assert.equal(classifyAiError(new AiProviderError('outage', 'overloaded_error')), 'outage');
  assert.equal(classifyAiError(new AiProviderError('invalid_request', 'invalid_request_error')), 'invalid_request');
  assert.equal(aiErrorCode(new AiProviderError('outage', 'rate_limit')), 'rate_limit');
  assert.equal(classifyAiError(new AiRefusedError('cyber')), 'refusal');
  // A bug in our own code must never be mistaken for an outage (no silent fallback).
  assert.equal(classifyAiError(new TypeError('x is undefined')), 'invalid_request');
  assert.equal(aiErrorCode(new TypeError('x is undefined')), 'unexpected_error');
  // Caller aborts are not outages either.
  assert.equal(classifyAiError(new APIUserAbortError()), 'invalid_request');
});
