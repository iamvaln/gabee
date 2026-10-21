import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, hourKey, localParts, weekKey, zonedTime } from './clock';

const DOUALA = 'Africa/Douala';

test('localParts reads the studio-local calendar and clock', () => {
  // 2026-10-28T03:00Z = Wednesday 04:00 in Douala (UTC+1).
  assert.deepEqual(localParts(new Date('2026-10-28T03:00:00Z'), DOUALA), { date: '2026-10-28', weekday: 3, hour: 4, minute: 0 });
  // Midnight is hour 0, never 24.
  assert.deepEqual(localParts(new Date('2026-10-28T23:00:00Z'), DOUALA), { date: '2026-10-29', weekday: 4, hour: 0, minute: 0 });
});

test('dayKey uses studio-local date across UTC midnight', () => {
  // Review Focus 1: 23:30 UTC on the 28th is already 00:30 on the 29th in Douala.
  assert.equal(dayKey(new Date('2026-10-28T23:30:00Z'), DOUALA), 'day:2026-10-29');
  assert.equal(dayKey(new Date('2026-10-28T22:59:00Z'), DOUALA), 'day:2026-10-28');
  // The other way round: 04:00 Douala is 03:00 UTC, same date.
  assert.equal(dayKey(new Date('2026-10-28T03:00:00Z'), DOUALA), 'day:2026-10-28');
});

test('weekKey is next Monday on a Sunday, this Monday otherwise', () => {
  // Sunday 2026-10-25 06:05 Douala.
  assert.equal(weekKey(new Date('2026-10-25T05:05:00Z'), DOUALA), 'week:2026-10-26');
  // Saturday 2026-10-24 23:30 UTC = Sunday 00:30 Douala → already next week.
  assert.equal(weekKey(new Date('2026-10-24T23:30:00Z'), DOUALA), 'week:2026-10-26');
  // Wednesday → the current week.
  assert.equal(weekKey(new Date('2026-10-28T10:00:00Z'), DOUALA), 'week:2026-10-26');
  // Monday 00:30 Douala (Sunday 23:30 UTC) → that Monday.
  assert.equal(weekKey(new Date('2026-11-01T23:30:00Z'), DOUALA), 'week:2026-11-02');
});

test('hourKey is the studio-local hour', () => {
  assert.equal(hourKey(new Date('2026-10-28T23:30:00Z'), DOUALA), 'hour:2026-10-29T00');
  assert.equal(hourKey(new Date('2026-10-28T08:59:00Z'), DOUALA), 'hour:2026-10-28T09');
});

test('zonedTime is the instant of a studio-local day and hour', () => {
  assert.equal(zonedTime('2026-10-29', 0, DOUALA).toISOString(), '2026-10-28T23:00:00.000Z');
  assert.equal(zonedTime('2026-10-28', 24, DOUALA).toISOString(), '2026-10-28T23:00:00.000Z');
  // A DST zone on both sides of the change (Paris leaves summer time on 2026-10-25).
  assert.equal(zonedTime('2026-10-24', 12, 'Europe/Paris').toISOString(), '2026-10-24T10:00:00.000Z');
  assert.equal(zonedTime('2026-10-26', 12, 'Europe/Paris').toISOString(), '2026-10-26T11:00:00.000Z');
});
