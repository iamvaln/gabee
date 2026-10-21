import test from 'node:test';
import assert from 'node:assert/strict';
import { dueJobs } from './schedule';

const DOUALA = 'Africa/Douala';
/** Studio-local Douala wall time (UTC+1, no DST) → instant. */
const at = (local: string) => new Date(Date.parse(`${local}:00Z`) - 3_600_000);
const keys = (now: Date) => dueJobs(now, DOUALA).map((j) => `${j.jobKey} ${j.periodKey}`);

test('dueJobs at Sunday 06:05 Douala includes week.propose for next Monday', () => {
  // 2026-10-25 is a Sunday.
  const due = keys(at('2026-10-25T06:05'));
  assert.ok(due.includes('week.propose week:2026-10-26'));
  assert.ok(!due.some((k) => k.startsWith('week.email')), 'the Sunday email is due at 07:00');
  assert.ok(!due.some((k) => k.startsWith('week.remind')));
  assert.ok(keys(at('2026-10-25T07:00')).includes('week.email week:2026-10-26'));
  assert.ok(!keys(at('2026-10-25T05:59')).some((k) => k.startsWith('week.propose')));
});

test('week jobs only run on Sunday', () => {
  const due = keys(at('2026-10-26T20:30'));
  assert.ok(!due.some((k) => k.startsWith('week.')));
});

test('day.notify missed at 05:00 still runs at 06:10, not before 05:00', () => {
  // Ruling 11: day.notify stays due 05:00 → 23:59 (it waits for the drafts).
  assert.ok(keys(at('2026-10-28T06:10')).includes('day.notify day:2026-10-28'));
  assert.ok(keys(at('2026-10-28T12:10')).includes('day.notify day:2026-10-28'));
  assert.ok(!keys(at('2026-10-28T04:50')).some((k) => k.startsWith('day.notify')));
  assert.ok(keys(at('2026-10-28T04:50')).includes('day.generate day:2026-10-28'));
  assert.ok(!keys(at('2026-10-28T03:59')).some((k) => k.startsWith('day.generate')));
});

test('day keys follow the studio-local date across UTC midnight', () => {
  // 2026-10-28T23:30Z = Thursday 00:30 in Douala: nothing of the 29th is due yet,
  // and Wednesday's jobs are no longer due.
  const due = dueJobs(new Date('2026-10-28T23:30:00Z'), DOUALA);
  assert.deepEqual(
    due.map((j) => `${j.jobKey} ${j.periodKey}`),
    ['budget.check hour:2026-10-29T00'],
  );
});

test('week.remind 15:00 is superseded once the 20:00 one is due', () => {
  assert.ok(keys(at('2026-10-25T15:10')).includes('week.remind week:2026-10-26@15'));
  const evening = keys(at('2026-10-25T20:05'));
  assert.ok(evening.includes('week.remind week:2026-10-26@20'));
  assert.ok(!evening.includes('week.remind week:2026-10-26@15'));
  assert.ok(!keys(at('2026-10-25T14:59')).some((k) => k.startsWith('week.remind')));
});

test('day.remind period keys carry the hour and 09:00 is superseded at 13:00', () => {
  assert.ok(!keys(at('2026-10-28T08:59')).some((k) => k.startsWith('day.remind')));
  assert.ok(keys(at('2026-10-28T09:10')).includes('day.remind day:2026-10-28@09'));
  const afternoon = keys(at('2026-10-28T13:00'));
  assert.ok(afternoon.includes('day.remind day:2026-10-28@13'));
  assert.ok(!afternoon.includes('day.remind day:2026-10-28@09'));
});

test('budget.check is due every hour with an hour period key', () => {
  assert.ok(keys(at('2026-10-28T06:40')).includes('budget.check hour:2026-10-28T06'));
  assert.ok(keys(at('2026-10-28T07:00')).includes('budget.check hour:2026-10-28T07'));
});

test('due jobs run in dependency order with their window deadline', () => {
  const due = dueJobs(at('2026-10-25T20:05'), DOUALA);
  assert.deepEqual(
    due.map((j) => j.jobKey),
    ['week.propose', 'week.email', 'week.remind', 'day.generate', 'day.notify', 'day.remind', 'budget.check'],
  );
  const deadline = (k: string) => due.find((j) => j.jobKey === k)?.deadline?.toISOString();
  // Day windows end at the next studio-local midnight; the 20:00 reminder too.
  assert.equal(deadline('day.notify'), '2026-10-25T23:00:00.000Z');
  assert.equal(deadline('week.remind'), '2026-10-25T23:00:00.000Z');
  assert.equal(deadline('day.remind'), '2026-10-25T23:00:00.000Z');
  assert.equal(deadline('budget.check'), '2026-10-25T20:00:00.000Z');
  assert.equal(dueJobs(at('2026-10-28T09:10'), DOUALA).find((j) => j.jobKey === 'day.remind')?.deadline?.toISOString(), '2026-10-28T12:00:00.000Z');
});
