import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyWaivers } from './waivers.mjs';

const NOW = new Date('2026-07-14T00:00:00Z');
const f = { tool: 'gitleaks', ruleId: 'api-key', path: 'a.ts', fingerprint: 'fp1', severity: 'HIGH' };

describe('applyWaivers', () => {
  it('waives a matching unexpired finding', () => {
    const r = applyWaivers([f], [{ fingerprint: 'fp1', reason: 'x', approver: 'v', expires: '2026-09-01' }], NOW);
    assert.equal(r.blocked.length, 0);
    assert.equal(r.waived.length, 1);
  });
  it('does not waive an expired waiver', () => {
    const r = applyWaivers([f], [{ fingerprint: 'fp1', reason: 'x', approver: 'v', expires: '2026-06-01' }], NOW);
    assert.equal(r.blocked.length, 1);
  });
  it('does not waive a non-matching fingerprint', () => {
    const r = applyWaivers([f], [{ fingerprint: 'other', reason: 'x', approver: 'v', expires: '2026-09-01' }], NOW);
    assert.equal(r.blocked.length, 1);
  });
});

describe('waiver accountability (reason + approver required)', () => {
  it('does NOT waive a matching unexpired waiver missing approver', () => {
    const r = applyWaivers([f], [{ fingerprint: 'fp1', reason: 'valid reason', expires: '2026-09-01' }], NOW);
    assert.equal(r.blocked.length, 1);
    assert.equal(r.waived.length, 0);
  });
  it('does NOT waive one missing/empty reason', () => {
    const r = applyWaivers([f], [{ fingerprint: 'fp1', reason: '  ', approver: 'v', expires: '2026-09-01' }], NOW);
    assert.equal(r.blocked.length, 1);
  });
});
