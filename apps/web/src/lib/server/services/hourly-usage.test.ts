import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localHourOf } from './hourly-usage-local';

test('adds offset and wraps to 0-23', () => {
  // 20:00 UTC + 120min = 22:00 local
  assert.equal(localHourOf(new Date('2026-07-10T20:00:00Z'), 120), 22);
  // 23:30 UTC + 60min = 00:30 local → hour 0
  assert.equal(localHourOf(new Date('2026-07-10T23:30:00Z'), 60), 0);
  // 01:00 UTC - 180min = 22:00 previous day → hour 22
  assert.equal(localHourOf(new Date('2026-07-10T01:00:00Z'), -180), 22);
});
