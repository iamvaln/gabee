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
