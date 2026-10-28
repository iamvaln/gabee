import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POSTING_DAYS } from '@gabee/types';
import { parsePostingDays, plannedDays, postingPlatformsOn } from './cadence';

const BOTH = ['linkedin', 'tiktok'] as const;

test('postingPlatformsOn: the enabled platforms posting on a weekday, in platform order', () => {
  assert.deepEqual(postingPlatformsOn(3, DEFAULT_POSTING_DAYS, [...BOTH]), ['linkedin', 'tiktok']); // Wednesday
  assert.deepEqual(postingPlatformsOn(2, DEFAULT_POSTING_DAYS, [...BOTH]), ['linkedin']);
  assert.deepEqual(postingPlatformsOn(0, DEFAULT_POSTING_DAYS, [...BOTH]), ['tiktok']);
  assert.deepEqual(postingPlatformsOn(6, DEFAULT_POSTING_DAYS, [...BOTH]), []);
  assert.deepEqual(postingPlatformsOn(3, DEFAULT_POSTING_DAYS, ['tiktok']), ['tiktok'], 'a disabled platform never posts');
});

test('plannedDays: a full week keeps only the days a platform posts on', () => {
  assert.deepEqual(plannedDays('2026-11-02', '2026-11-02', DEFAULT_POSTING_DAYS, [...BOTH]), [
    { date: '2026-11-02', platforms: ['tiktok'] },
    { date: '2026-11-03', platforms: ['linkedin'] },
    { date: '2026-11-04', platforms: ['linkedin', 'tiktok'] },
    { date: '2026-11-05', platforms: ['linkedin'] },
    { date: '2026-11-06', platforms: ['tiktok'] },
    { date: '2026-11-08', platforms: ['tiktok'] },
  ]);
});

test('plannedDays: a partial week starts at firstDay', () => {
  assert.deepEqual(plannedDays('2026-11-02', '2026-11-05', DEFAULT_POSTING_DAYS, [...BOTH]), [
    { date: '2026-11-05', platforms: ['linkedin'] },
    { date: '2026-11-06', platforms: ['tiktok'] },
    { date: '2026-11-08', platforms: ['tiktok'] },
  ]);
  assert.deepEqual(plannedDays('2026-11-02', '2026-11-07', { linkedin: [1], tiktok: [2] }, [...BOTH]), [], 'nothing posts on Saturday or Sunday');
});

test('parsePostingDays keeps valid weekdays, sorted; anything malformed is the default', () => {
  assert.deepEqual(parsePostingDays({ linkedin: [4, 2], tiktok: [6] }), { linkedin: [2, 4], tiktok: [6] });
  assert.deepEqual(parsePostingDays({ linkedin: [2, 2], tiktok: [6] }), DEFAULT_POSTING_DAYS);
  assert.deepEqual(parsePostingDays({ linkedin: [9], tiktok: [] }), DEFAULT_POSTING_DAYS);
  assert.deepEqual(parsePostingDays(null), DEFAULT_POSTING_DAYS);
  assert.deepEqual(parsePostingDays({ linkedin: [1] }), DEFAULT_POSTING_DAYS);
});
