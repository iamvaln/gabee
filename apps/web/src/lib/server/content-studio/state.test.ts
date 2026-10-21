import test from 'node:test';
import assert from 'node:assert/strict';
import { addDaysYmd, canTransition, daysInWeek, planWeek, weekdayOf } from './state';

test('canTransition forbids published → ready', () => {
  assert.equal(canTransition('draft', 'published', 'ready'), false);
  assert.equal(canTransition('draft', 'published', 'stale'), false);
  assert.equal(canTransition('draft', 'published', 'generating'), false);
});

test('canTransition follows the draft graph (stale from ready|approved, failed → generating)', () => {
  assert.equal(canTransition('draft', 'generating', 'ready'), true);
  assert.equal(canTransition('draft', 'generating', 'failed'), true);
  assert.equal(canTransition('draft', 'ready', 'approved'), true);
  assert.equal(canTransition('draft', 'approved', 'published'), true);
  assert.equal(canTransition('draft', 'ready', 'stale'), true);
  assert.equal(canTransition('draft', 'approved', 'stale'), true);
  assert.equal(canTransition('draft', 'failed', 'generating'), true);
  assert.equal(canTransition('draft', 'stale', 'generating'), true);
  assert.equal(canTransition('draft', 'generating', 'stale'), false);
  assert.equal(canTransition('draft', 'failed', 'stale'), false);
  assert.equal(canTransition('draft', 'ready', 'published'), false);
  assert.equal(canTransition('draft', 'nope', 'ready'), false);
});

test('canTransition follows the week and slot graphs', () => {
  assert.equal(canTransition('week', 'proposing', 'proposals_ready'), true);
  assert.equal(canTransition('week', 'proposals_ready', 'direction_set'), true);
  assert.equal(canTransition('week', 'direction_set', 'titles_ready'), true);
  assert.equal(canTransition('week', 'titles_ready', 'direction_set'), true);
  assert.equal(canTransition('week', 'titles_ready', 'validated'), true);
  assert.equal(canTransition('week', 'proposals_ready', 'validated'), false);
  assert.equal(canTransition('week', 'validated', 'skipped'), false);
  assert.equal(canTransition('slot', 'proposed', 'validated'), true);
  assert.equal(canTransition('slot', 'validated', 'drafting'), true);
  assert.equal(canTransition('slot', 'drafting', 'drafted'), true);
  assert.equal(canTransition('slot', 'drafted', 'done'), true);
  assert.equal(canTransition('slot', 'drafted', 'skipped'), true);
  assert.equal(canTransition('slot', 'done', 'skipped'), false);
  assert.equal(canTransition('slot', 'skipped', 'validated'), false);
});

test('planWeek: Sunday → next full week; Monday–Saturday → current week from tomorrow', () => {
  // 2026-10-25 is a Sunday.
  assert.equal(weekdayOf('2026-10-25'), 0);
  assert.deepEqual(planWeek('2026-10-25'), { startsOn: '2026-10-26', firstDay: '2026-10-26' });
  assert.deepEqual(planWeek('2026-10-26'), { startsOn: '2026-10-26', firstDay: '2026-10-27' });
  assert.deepEqual(planWeek('2026-10-21'), { startsOn: '2026-10-19', firstDay: '2026-10-22' });
  assert.deepEqual(planWeek('2026-10-31'), { startsOn: '2026-10-26', firstDay: '2026-11-01' });
  assert.equal(addDaysYmd('2026-12-31', 1), '2027-01-01');
  assert.equal(daysInWeek('2026-10-26', '2026-10-26'), 7);
  assert.equal(daysInWeek('2026-10-19', '2026-10-22'), 4);
});
