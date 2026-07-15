// apps/kid/src/lib/audio/music.test.ts
// Pure gates for the ambient-music layer (audio phase E spec §7.1). The audible
// engine is covered by the fake-AudioContext module test and the e2e spec.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldPlayMusic } from './music';
import { isSessionRoute } from '../router';

describe('shouldPlayMusic', () => {
  it('plays only in ambient zone with BOTH switches on', () => {
    assert.equal(shouldPlayMusic('ambient', true, true), true);
    assert.equal(shouldPlayMusic('silent', true, true), false);
    assert.equal(shouldPlayMusic('ambient', false, true), false); // master wins
    assert.equal(shouldPlayMusic('ambient', true, false), false);
    assert.equal(shouldPlayMusic('silent', false, false), false);
  });
});

describe('isSessionRoute', () => {
  // Every route name in lib/router.ts's Route union, classified. If a new route
  // is added, TypeScript forces it into one of these lists (Route['name'] param).
  const sessions = [
    'session', 'words_picture_session', 'words_fill_session', 'words_build_session',
    'words_read_session', 'translation_session', 'keyboard_static_session',
    'keyboard_scrolling_session', 'code_session',
  ] as const;
  const ambient = [
    'hub', 'carte_road', 'numbers_subhub', 'levelmap', 'lessonmap', 'summary',
    'words_subhub', 'words_picture_levelmap', 'words_picture_lessonmap', 'words_picture_summary',
    'words_fill_levelmap', 'words_fill_lessonmap', 'words_fill_summary',
    'words_build_levelmap', 'words_build_lessonmap', 'words_build_summary',
    'words_read_levelmap', 'words_read_lessonmap', 'words_read_summary',
    'translation_levelmap', 'translation_lessonmap', 'translation_summary',
    'keyboard_subhub', 'keyboard_static_levelmap', 'keyboard_static_lessonmap', 'keyboard_static_summary',
    'keyboard_scrolling_levelmap', 'keyboard_scrolling_lessonmap', 'keyboard_scrolling_summary',
    'code_subhub', 'code_levelmap', 'code_lessonmap', 'code_summary', 'settings',
  ] as const;

  it('silences every session route', () => {
    for (const n of sessions) assert.equal(isSessionRoute(n), true, n);
  });
  it('keeps every other route ambient', () => {
    for (const n of ambient) assert.equal(isSessionRoute(n), false, n);
  });
});
