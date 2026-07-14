// Pref semantics (spec §3): the persisted value is "last selected kid's pref" —
// seeded from profile.audio_enabled on select, kept in sync both ways on toggle
// so later setProfile({...profile}) spreads can't revert it.
import './test/setup-dom'; // MUST be first: registers jsdom (localStorage for persist).

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { ChildProfile } from '@gabee/types';
import { useStore } from './store';

const kid = (over: Partial<ChildProfile>): ChildProfile =>
  ({ ...useStoreTestProfileBase, ...over }) as ChildProfile;

// Minimal valid profile — only fields the store actually reads matter here.
const useStoreTestProfileBase = {
  id: 'p1',
  name: 'Testkid',
  language: 'fr',
  audio_enabled: true,
  total_stars: 0,
} as unknown as ChildProfile;

describe('store audioEnabled', () => {
  beforeEach(() => {
    useStore.setState({ profile: null, audioEnabled: true });
  });

  it('defaults to true', () => {
    assert.equal(useStore.getState().audioEnabled, true);
  });

  it('seeds from profile.audio_enabled on profile select', () => {
    useStore.getState().setProfile(kid({ audio_enabled: false }));
    assert.equal(useStore.getState().audioEnabled, false);
    useStore.getState().setProfile(kid({ audio_enabled: true }));
    assert.equal(useStore.getState().audioEnabled, true);
  });

  it('setAudioEnabled flips the pref AND the profile copy (so star-update spreads keep it)', () => {
    useStore.getState().setProfile(kid({ audio_enabled: true }));
    useStore.getState().setAudioEnabled(false);
    const s = useStore.getState();
    assert.equal(s.audioEnabled, false);
    assert.equal(s.profile?.audio_enabled, false);
    // Simulate a session updating stars via spread — pref must survive.
    s.setProfile({ ...s.profile!, total_stars: 5 });
    assert.equal(useStore.getState().audioEnabled, false);
  });

  it('clearing the profile leaves the pref untouched', () => {
    useStore.getState().setAudioEnabled(false);
    useStore.getState().setProfile(null);
    assert.equal(useStore.getState().audioEnabled, false);
  });
});
