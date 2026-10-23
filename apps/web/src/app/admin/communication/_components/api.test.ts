import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, provesRunEnded } from './api';
import { failureOf, weekLooksStuck, STUCK_MS } from './StartWeek';
import { unknownOutcomeText } from './errors';
import type { WeekDto } from '@/lib/server/content-studio/weeks';

// A long AI call may only be offered again at once when the server's answer proves it ended.

const fromServer = (status: number, code: string) => new ApiError(status, code, 'message', undefined, true);

test('provesRunEnded: the API’s own JSON answer for an AI failure or a 5xx proves the run is over', () => {
  assert.equal(provesRunEnded(fromServer(503, 'ai_unavailable')), true);
  assert.equal(provesRunEnded(fromServer(422, 'ai_refused')), true);
  assert.equal(provesRunEnded(fromServer(422, 'ai_invalid_output')), true);
  assert.equal(provesRunEnded(fromServer(500, 'internal_error')), true, 'a JSON 500: the route’s error path ran');
});

test('provesRunEnded: anything else proves nothing (the server may still be working)', () => {
  assert.equal(provesRunEnded(fromServer(409, 'generation_in_progress')), false, 'a run is live');
  assert.equal(provesRunEnded(fromServer(409, 'invalid_transition')), false);
  assert.equal(provesRunEnded(new ApiError(0, 'network', 'Network request failed')), false, 'no answer');
  assert.equal(provesRunEnded(new ApiError(524, 'internal_error', '<html>timeout</html>')), false, 'a proxy page, not our JSON');
  assert.equal(provesRunEnded(new ApiError(502, 'internal_error', 'HTTP 502')), false, 'a 5xx without our error body');
  assert.equal(provesRunEnded(new Error('boom')), false);
  assert.equal(provesRunEnded(null), false);
});

test('failureOf: an unanswered call says the outcome is unknown and does not end the run', () => {
  for (const lang of ['fr', 'en'] as const) {
    assert.deepEqual(failureOf(new ApiError(0, 'network', 'x'), lang), { message: unknownOutcomeText(lang), ended: false });
    assert.deepEqual(failureOf(new ApiError(524, 'internal_error', '<html>'), lang), { message: unknownOutcomeText(lang), ended: false });
  }
});

test('failureOf: the API’s own answer is put in plain words, ended only when it proves it', () => {
  const unavailable = failureOf(fromServer(503, 'ai_unavailable'), 'fr');
  assert.equal(unavailable.ended, true);
  assert.match(unavailable.message, /Le service d'IA est indisponible/);
  const busy = failureOf(new ApiError(409, 'generation_in_progress', 'Gabee travaille déjà sur cette semaine.', undefined, true), 'fr');
  assert.deepEqual(busy, { message: 'Gabee travaille déjà sur cette semaine.', ended: false });
  const bug = failureOf(new Error('boom'), 'en');
  assert.equal(bug.ended, false);
  assert.match(bug.message, /Something unexpected went wrong/);
});

test('weekLooksStuck: only once the week is untouched for the guard window', () => {
  const at = (msAgo: number) => ({ updated_at: new Date(Date.now() - msAgo).toISOString() }) as WeekDto;
  assert.equal(weekLooksStuck(at(STUCK_MS - 60_000)), false);
  assert.equal(weekLooksStuck(at(STUCK_MS + 1_000)), true);
});
