// apps/kid/src/lib/audio/voice.test.ts
// Voice picking is the only pure logic in the voice layer — the utterance
// lifecycle is manual QA (spec §8). Plain node:test, fake voice objects.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice } from './voice';

const v = (lang: string, def = false) =>
  ({ lang, default: def, name: lang, localService: true, voiceURI: lang }) as SpeechSynthesisVoice;

describe('pickVoice', () => {
  it('prefers the default voice matching the language', () => {
    const fr2 = v('fr-CA', true);
    assert.equal(pickVoice([v('en-US'), v('fr-FR'), fr2], 'fr'), fr2);
  });

  it('falls back to the first matching voice when none is default', () => {
    const fr1 = v('fr-FR');
    assert.equal(pickVoice([v('en-US'), fr1, v('fr-CA')], 'fr'), fr1);
  });

  it('matches case-insensitively on the primary subtag', () => {
    const en = v('EN-GB');
    assert.equal(pickVoice([en], 'en'), en);
  });

  it('returns null when the device has no matching voice (skip > wrong language, spec §5)', () => {
    assert.equal(pickVoice([v('de-DE')], 'fr'), null);
    assert.equal(pickVoice([], 'en'), null);
  });
});
