import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveMonths } from './objective-months';

test('the objective card offers this month and next', () => {
  // Wed 21 Oct 2026: this week started Mon 19 Oct.
  assert.deepEqual(objectiveMonths('2026-10-21'), { months: ['2026-10', '2026-11'], thisMonth: '2026-10' });
  assert.deepEqual(objectiveMonths('2026-12-31'), { months: ['2026-12', '2027-01'], thisMonth: '2026-12' });
});

test('…and first the month of this week’s Monday when the week straddles two months', () => {
  // Sun 1 Nov 2026: the current week started Mon 26 Oct and takes October's objective.
  assert.deepEqual(objectiveMonths('2026-11-01'), { months: ['2026-10', '2026-11', '2026-12'], thisMonth: '2026-11' });
  // Fri 1 Jan 2027: the week of Mon 28 Dec 2026.
  assert.deepEqual(objectiveMonths('2027-01-01'), { months: ['2026-12', '2027-01', '2027-02'], thisMonth: '2027-01' });
  // Mon 2 Nov 2026: a new week in the new month.
  assert.deepEqual(objectiveMonths('2026-11-02').months, ['2026-11', '2026-12']);
});
