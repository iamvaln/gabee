import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bundleLoadFailed } from './bundleLoad';

const base = { isLoading: false, isError: false, hasBundle: false, offline: false };

describe('bundleLoadFailed', () => {
  it('is true on a query error', () => {
    assert.equal(bundleLoadFailed({ ...base, isError: true }), true);
  });
  it('is true when settled with no bundle while offline (stuck)', () => {
    assert.equal(bundleLoadFailed({ ...base, isLoading: false, hasBundle: false, offline: true }), true);
  });
  it('is false while still loading', () => {
    assert.equal(bundleLoadFailed({ ...base, isLoading: true, offline: true }), false);
  });
  it('is false when a bundle is present (even offline)', () => {
    assert.equal(bundleLoadFailed({ ...base, hasBundle: true, offline: true }), false);
  });
  it('is false when online with no bundle yet (still resolving)', () => {
    assert.equal(bundleLoadFailed({ ...base, hasBundle: false, offline: false }), false);
  });
});
