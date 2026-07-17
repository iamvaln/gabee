import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from '../store';
import { isFeatureEnabled } from './flags';

describe('isFeatureEnabled', () => {
  beforeEach(() => {
    useStore.setState({ featureFlags: {} });
  });

  it('falls back to the code default when never fetched', () => {
    assert.equal(isFeatureEnabled('kid_voiceover'), true);
    assert.equal(isFeatureEnabled('kid_ambient_music'), false);
  });

  it('reads a stored value, including a stored false', () => {
    useStore.setState({ featureFlags: { kid_voiceover: false, kid_ambient_music: true } });
    assert.equal(isFeatureEnabled('kid_voiceover'), false);
    assert.equal(isFeatureEnabled('kid_ambient_music'), true);
  });
});

import { isModuleVisibleWith, isLevelVisibleWith, visibleLevels } from './flags';
import type { FlagKey } from '@gabee/types';

describe('content visibility', () => {
  const on = (_k: FlagKey) => true;
  const off = (_k: FlagKey) => false;
  it('unflagged module/level is always visible regardless of lookup', () => {
    assert.equal(isModuleVisibleWith('code', off), true);
    assert.equal(isLevelVisibleWith('code', 3, off), true);
    assert.equal(isLevelVisibleWith('numbers', 1, off), true);
  });
  it('flagged level follows the lookup', () => {
    assert.equal(isLevelVisibleWith('code', 6, off), false);
    assert.equal(isLevelVisibleWith('code', 6, on), true);
  });
  it('visibleLevels filters a level list by the lookup', () => {
    assert.deepEqual(visibleLevels('code', [1, 2, 6], off), [1, 2]);
    assert.deepEqual(visibleLevels('code', [1, 2, 6], on), [1, 2, 6]);
  });
});
