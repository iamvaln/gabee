import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from '../store';
import { isFeatureEnabled } from './flags';

describe('isFeatureEnabled', () => {
  beforeEach(() => {
    useStore.setState({ featureFlags: {} });
  });

  it('falls back to the code default when never fetched (all audio dark)', () => {
    assert.equal(isFeatureEnabled('kid_voiceover'), false);
    assert.equal(isFeatureEnabled('kid_ambient_music'), false);
  });

  it('reads a stored value, including a stored false', () => {
    useStore.setState({ featureFlags: { kid_voiceover: false, kid_ambient_music: true } });
    assert.equal(isFeatureEnabled('kid_voiceover'), false);
    assert.equal(isFeatureEnabled('kid_ambient_music'), true);
  });
});

import { isModuleVisibleWith, isLevelVisibleWith, visibleLevels, isWorldLevelVisibleWith, visibleWorldLevels } from './flags';
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

describe('world-scoped visibility (code_draw_l4)', () => {
  // Only draw:4 carries a world flag; a lookup that turns everything off must
  // still leave maze/actions L4 visible and gate ONLY the draw world's L4.
  const only = (key: FlagKey) => (k: FlagKey) => k === key;
  const allOff = (_k: FlagKey) => false;
  const drawOff = (k: FlagKey) => k !== 'code_draw_l4'; // everything on except the draw gate
  it('gates the draw pen ladder (L4+L5) without touching maze/actions', () => {
    assert.equal(isWorldLevelVisibleWith('code', 'draw', 4, drawOff), false);
    assert.equal(isWorldLevelVisibleWith('code', 'draw', 5, drawOff), false); // combine rides the gate
    assert.equal(isWorldLevelVisibleWith('code', 'maze', 4, drawOff), true);
    assert.equal(isWorldLevelVisibleWith('code', 'actions', 4, drawOff), true);
  });
  it('draw L4 appears once its flag is on', () => {
    assert.equal(isWorldLevelVisibleWith('code', 'draw', 4, only('code_draw_l4')), true);
  });
  it('still honours the module-level gate (code_l6) in every world', () => {
    assert.equal(isWorldLevelVisibleWith('code', 'draw', 6, allOff), false); // code_l6 off → L6 hidden
    assert.equal(isWorldLevelVisibleWith('code', 'maze', 6, allOff), false);
    assert.equal(isWorldLevelVisibleWith('code', 'draw', 6, only('code_l6')), true); // L6 on; draw:6 has no world flag
  });
  it('visibleWorldLevels hides the draw pen ladder (no L4/L5 gap) but not maze', () => {
    assert.deepEqual(visibleWorldLevels('code', 'draw', [1, 2, 3, 4, 5], drawOff), [1, 2, 3]);
    assert.deepEqual(visibleWorldLevels('code', 'maze', [1, 2, 3, 4, 5], drawOff), [1, 2, 3, 4, 5]);
  });
});
