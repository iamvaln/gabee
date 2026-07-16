import './../test/setup-dom'; // MUST be first: jsdom provides localStorage
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sessionResumeKey, loadResume, clearResume } from './sessionResume';

beforeEach(() => localStorage.clear());

test('sessionResumeKey builds the namespaced key (anon when profileId is null)', () => {
  assert.equal(sessionResumeKey('p1', 'words:picture', 2, 3), 'gabee:resume:p1:words:picture:2:3');
  assert.equal(sessionResumeKey(null, 'numbers:counting', 1, 1), 'gabee:resume:anon:numbers:counting:1:1');
});

test('loadResume returns null for a missing key', () => {
  assert.equal(loadResume('gabee:resume:none'), null);
});

test('loadResume round-trips a valid saved SessionProgress', () => {
  const key = sessionResumeKey('p1', 'words:picture', 1, 1);
  localStorage.setItem(key, JSON.stringify({ qIdx: 3, score: 2 }));
  assert.deepEqual(loadResume(key), { qIdx: 3, score: 2 });
});

test('loadResume rejects malformed / out-of-range payloads', () => {
  const key = 'gabee:resume:p1:t:1:1';
  localStorage.setItem(key, 'not json');
  assert.equal(loadResume(key), null);
  localStorage.setItem(key, JSON.stringify({ qIdx: -1, score: 0 })); // qIdx must be >= 0
  assert.equal(loadResume(key), null);
  localStorage.setItem(key, JSON.stringify({ qIdx: 1 })); // missing score
  assert.equal(loadResume(key), null);
});

test('clearResume removes the saved progress', () => {
  const key = sessionResumeKey('p1', 'words:picture', 1, 1);
  localStorage.setItem(key, JSON.stringify({ qIdx: 1, score: 1 }));
  clearResume(key);
  assert.equal(loadResume(key), null);
});
