// apps/kid/src/lib/audio/voice.ts
// Narration behind a provider interface (audio spec §2/§5): v0.1 is browser
// speechSynthesis; a RecordedVoiceProvider can replace it later without any
// call-site change. Known platform quirks handled here: voices load async,
// iOS sometimes never fires onend (safety timer), stop() must also cancel a
// pending word→praise chain (generation counter).
export interface VoiceProvider {
  speak(text: string, lang: 'fr' | 'en'): Promise<void>;
  stop(): void;
  warm?(): void;
}

/**
 * Choose a voice for `lang`: default-flagged match first, then first match,
 * else null — the caller SKIPS narration rather than using a wrong-language
 * voice (spec §5).
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: 'fr' | 'en',
): SpeechSynthesisVoice | null {
  const matches = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  return matches.find((v) => v.default) ?? matches[0] ?? null;
}

const BCP47: Record<'fr' | 'en', string> = { fr: 'fr-FR', en: 'en-US' };

export class WebSpeechVoiceProvider implements VoiceProvider {
  private warmed = false;
  /** Bumped by stop() — in-flight chains check it and abandon silently. */
  generation = 0;
  speaking = false;

  private get synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null;
  }

  speak(text: string, lang: 'fr' | 'en'): Promise<void> {
    const synth = this.synth;
    if (!synth || !text.trim()) return Promise.resolve();
    const voice = pickVoice(synth.getVoices(), lang);
    if (!voice) return Promise.resolve(); // no matching voice → skip, don't mispronounce
    return new Promise((resolve) => {
      try {
        synth.cancel(); // one narration at a time
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = BCP47[lang];
        u.rate = 0.9; // slightly slow for young listeners
        this.speaking = true;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          this.speaking = false;
          clearTimeout(safety);
          resolve();
        };
        // iOS quirk: onend is not reliable — never leave `speaking` stuck.
        const safety = setTimeout(finish, 15000);
        u.onend = finish;
        u.onerror = finish;
        synth.speak(u);
      } catch {
        this.speaking = false;
        resolve();
      }
    });
  }

  stop(): void {
    this.generation++;
    this.speaking = false;
    try {
      this.synth?.cancel();
    } catch {
      /* never throw from a key handler */
    }
  }

  /** Prime within a user-gesture context; safe to call on every gesture. */
  warm(): void {
    if (this.warmed) return;
    this.warmed = true;
    try {
      this.synth?.getVoices(); // kick async voice loading
    } catch {
      /* ignore */
    }
  }
}
