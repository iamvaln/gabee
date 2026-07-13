// apps/kid/src/lib/audio/voice.test.ts
// Voice picking is the only pure logic in the voice layer — the utterance
// lifecycle is manual QA (spec §8). Plain node:test, fake voice objects.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, WebSpeechVoiceProvider } from './voice';

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

describe('WebSpeechVoiceProvider', () => {
  it('a stale onend from an interrupted utterance does not clear speaking', () => {
    // Regression: speak(B) interrupts A via synth.cancel(); the browser fires
    // A's onend ASYNCHRONOUSLY, after B set speaking=true. That late callback
    // must not clobber speaking while B is audibly playing.
    interface FakeUtterance {
      text: string;
      voice: unknown;
      lang: string;
      rate: number;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    }
    const spoken: FakeUtterance[] = [];
    const fakeSynth = {
      getVoices: () => [v('fr-FR', true), v('en-US', true)],
      cancel: () => {
        /* real browsers fire the interrupted utterance's onend LATER — the
           test replays it manually below */
      },
      speak: (u: FakeUtterance) => spoken.push(u),
    };
    const g = globalThis as Record<string, unknown>;
    g.window = { speechSynthesis: fakeSynth };
    g.SpeechSynthesisUtterance = class {
      text: string;
      voice: unknown = null;
      lang = '';
      rate = 0;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(t: string) {
        this.text = t;
      }
    };
    try {
      const provider = new WebSpeechVoiceProvider();
      void provider.speak('un', 'fr');
      assert.equal(provider.speaking, true);
      void provider.speak('deux', 'fr'); // interrupts A
      assert.equal(provider.speaking, true);
      assert.equal(spoken.length, 2);
      spoken[0]?.onend?.(); // A's late, cancel-triggered onend arrives now
      assert.equal(provider.speaking, true, 'stale onend must not clear speaking while B plays');
      spoken[1]?.onend?.(); // B genuinely finishes
      assert.equal(provider.speaking, false);
    } finally {
      delete g.window;
      delete g.SpeechSynthesisUtterance;
    }
  });
});
