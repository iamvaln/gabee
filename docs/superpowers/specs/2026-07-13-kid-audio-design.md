# Gabee Kid App — Audio Design (v0.1)

**Status: APPROVED** · 2026-07-13 · supersedes `docs/gabee-kid-audio-plan-v0.1-draft.md`
**Grounded in:** product-spec-v0.1 §4.7 (Voiceover), §7.3 (Kid settings), §15 (Identity); design-spec §Bee; the current `apps/kid` codebase (claims re-verified 2026-07-13).

## Decisions (all resolved)

| Decision | Choice |
|---|---|
| Voice source | TTS behind a provider abstraction now; recorded/generated files later without call-site changes |
| SFX style | Procedural (code-generated tones), consistent with existing `playMsgDing` |
| SFX scope (first pass) | All sessions at once — `correct`/`wrong` wherever `setFeedback(...)` runs, plus rewards/unlock/nav cues |
| Wrong-answer cue | Gentle non-punitive low tone — never a buzzer (brand: encouraging) |
| Settings toggle | One master `audio_enabled` switch (existing schema field; no API changes) |
| Sonic identity | All cues derive from the existing message-ding A5→E6 motif family |
| Ducking | None in v0.1 — new SFX are suppressed while narration is speaking (one boolean check); revisit in Phase D |
| Background music | Not during learning tasks, ever. Deferred entirely — see Phase E |

## 1. What already exists (verified 2026-07-13 — don't rebuild)

- **Procedural audio precedent:** `apps/kid/src/lib/messages.ts:124` → `playMsgDing()` synthesizes a two-note chime via `AudioContext`, reuses a shared `window.__gabeeAudio` context, resumes if suspended, swallows gesture-gate errors. Template for the whole SFX layer.
- **Settings flag in the type system:** `packages/types/src/progress.ts:129` → `ChildProfileSchema.audio_enabled: z.boolean().default(true)`.
- **API contract defined:** `PATCH /api/profiles/:id` (`packages/types/src/api/profiles.ts`) already accepts and returns `audio_enabled`. No backend/type work needed.
- **Icons drawn:** `apps/kid/src/components/Icon.tsx` has `'sound'` and `'sound-off'`.
- **Feedback states wired:** every `*Session.tsx` tracks `feedback: 'correct' | 'wrong' | null` and drives Bee expressions + coach text. These are the SFX hook points — no new state.
- **i18n spoken strings exist:** `excellent`, `correctMsg`, `youCanDoIt` — reusable as voiceover phrases.
- **Not yet existing (to build):** no TTS code anywhere in the app; no `updateProfile` helper in `apps/kid/src/lib/api.ts`; no audio toggle in `apps/kid/src/screens/Settings.tsx`.

## 2. Architecture — one audio module, two layers

`apps/kid/src/lib/audio/` is the single audio boundary. No screen ever touches `AudioContext` or a TTS API directly.

```
src/lib/audio/
  index.ts        // public API: sfx(), speak(), stopSpeaking(), setEnabled(), isEnabled()
  context.ts      // shared AudioContext (absorbs window.__gabeeAudio), unlock-on-gesture
  sfx.ts          // procedural cue synths (correct, wrong, tap, unlock, milestone…)
  voice.ts        // VoiceProvider interface + WebSpeechVoiceProvider
  prefs.ts        // audio-enabled preference (read/write, offline-first)
```

```ts
interface VoiceProvider {
  speak(text: string, lang: 'fr' | 'en'): Promise<void>;
  stop(): void;
  warm?(): void; // optional preload/priming on first gesture
}
```

v0.1 ships `WebSpeechVoiceProvider` (browser `speechSynthesis`). Swapping to a `RecordedVoiceProvider` (cached MP3s) later is a one-line provider switch — call sites (`speak(word, lang)`) never change.

## 3. The preference: `audio_enabled` (offline-first)

Constraint: the kid app is offline-first and `store.profile` is not persisted (re-picked each launch).

- Add `audioEnabled: boolean` to `apps/kid/src/store.ts` and to `partialize` (line ~100), mirroring `lang`.
- **Semantics: the persisted value is "last selected kid's pref."** Always re-seed from `profile.audio_enabled` on profile select (default `true`) — this is what makes a shared device correct for multiple kids.
- On toggle: (1) flip the local pref immediately (instant, works offline); (2) best-effort `PATCH /api/profiles/:id { audio_enabled }` via a new `updateProfile` helper in `src/lib/api.ts`. Failure is non-fatal; the local pref is source of truth on-device.
- `audio.isEnabled()` reads this pref; every `sfx()`/`speak()` no-ops when disabled. Turning the switch OFF also silences any in-flight narration immediately.
- **Known v0.1 limitation:** if the PATCH fails (offline toggle) the server keeps the old value, so the next profile re-select re-seeds the stale server pref — the local change silently reverts. Accepted for v0.1; a retry queue can fix it later if it bites.

## 4. SFX layer (procedural)

Cue catalog — short synthesized envelopes in the `playMsgDing` style, all derived from the A5→E6 motif family, soft and short (150–500 ms):

| Cue | Fires on | Character |
|---|---|---|
| `correct` | `feedback === 'correct'` in every `*Session.tsx` | bright rising two-note |
| `wrong` | `feedback === 'wrong'` | soft low "boop" — encouraging, not a buzzer |
| `tap` | primary button / answer select | very short tick, low volume |
| `navSelect` | `BottomNav` tab change | subtle blip |
| `unlock` | level/lesson unlock on map screens | small sparkle arpeggio |
| `milestone` | `MilestoneCelebration`, badge award, `Coffre`/`GiftCard` | fuller celebratory sting |
| `message` | `MessageBandeau` (migrated from `playMsgDing`, exact current tones) | existing two-note ding |
| `sessionStart` | session begins (optional, cut first if it feels noisy) | gentle "here we go" |

Integration points: all `*Session.tsx` screens (Numbers, WordsRead/Fill/Build/Picture, CodeTurtle, KeyboardStatic/Scrolling, Translation), `MilestoneCelebration.tsx`, `BadgeRow.tsx`, `Coffre.tsx`, `GiftCard.tsx`, `*LevelMap`/`*LessonMap` unlock transitions, `BottomNav.tsx`, `MessageBandeau.tsx`.

No ducking: while narration is in flight, new SFX are suppressed (single boolean check).

**The hard part of this phase is tuning, not wiring.** Budget explicit listening QA on real target hardware (tablet speaker at full volume, ideally with a kid) — desktop-speaker judgment is not acceptance.

## 5. Voiceover layer (TTS now, recorded later)

Per spec §4.7 — primary scope: **Keyboard (static) + Translation** sessions. KeyboardScrolling is deliberately excluded: narrating a time-pressured scrolling word works against the exercise; revisit with Phase D if wanted. Two play moments:

1. **On prompt appears** — read the word/prompt aloud in the item's language. Translation image cards (all of L1) have no source word and anything word-shaped could leak the answer, so the INSTRUCTION is read in the kid's UI language instead — but only ONCE, on the session's first question (per-card repetition was too chatty). Decided with Valentine during QA 2026-07-14.
2. **On success** — read the word again, then a spoken "Bravo !" (reuse i18n strings).

Rules (from spec, must honor):

- **Never blocks input.** Any tap/keypress during narration → `stopSpeaking()` immediately; play continues. This hooks into the Keyboard session's key handlers — hot-path code — so the call must be synchronous, cheap, and error-swallowed; it must never add latency or throw during typing.
- **Respects the master toggle.**
- **Gesture-gated:** prime the provider on the first tap of a session (`warm()`), swallow failures silently.
- **Language:** `speak(text, lang)`; the provider picks a matching `fr`/`en` `SpeechSynthesisVoice`, falling back gracefully (skip narration rather than use a wrong-language voice).

**Known risk — Web Speech quality (product risk, not code risk).** French voices vary wildly across devices (robotic or absent on some Android builds; iOS loads voices asynchronously, silently pauses `speechSynthesis`, and doesn't always fire `onend`). Phase C therefore *proves the wiring*, not the final voice experience.

**Phase C escape hatch (explicit acceptance criterion):** if French TTS sounds bad on real target devices, ship Phase C dark (wired but not user-facing) and accelerate Phase D. The Keyboard/Translation vocabulary is finite and seeded, so pre-generating MP3s per item+lang is tractable — Phase D is the phase that actually delivers the spec's intent.

## 6. Offline / PWA notes

- Procedural SFX: zero assets, perfect offline (a reason procedural was chosen).
- Browser TTS availability/quality varies and some platforms need network — accepted for v0.1; the file-based upgrade removes the dependency, cached alongside question bundles (`src/lib/bundles.ts` pattern).
- Nothing new to precache in v0.1 (no Workbox manifest changes).

## 7. Accessibility & UX guardrails

- Audio is opt-out (`audio_enabled` defaults `true`); the toggle is one tap in kid Settings (`sound`/`sound-off` icons).
- Cues are short, soft, non-startling; wrong-answer cue is gentle, never punitive.
- All audio calls are fire-and-forget and error-swallowing: audio must **never** break a render or block gameplay.

## 8. Testing strategy

Actual sound cannot be meaningfully unit-tested. Split accordingly:

- **Unit-testable (do test):** enable/disable gate (everything no-ops when off), cue-table completeness, provider selection/fallback, pref seeding + toggle semantics (including the PATCH-failure path).
- **Manual QA per phase (real touch device):** gesture gating, toggle off = total silence, narration stops on input, cue pleasantness on tablet speakers.
- Each phase ends with manual QA + typecheck/lint.

## 9. Build sequence (each phase shippable alone)

- **Phase A — Engine + toggle.** `src/lib/audio/*`, absorb `playMsgDing`, `audioEnabled` store pref + persistence + profile-select seeding, kid-Settings toggle, `updateProfile` API helper. No behavior change beyond the toggle.
- **Phase B — SFX pass.** `correct`/`wrong` in all sessions, then rewards/unlock/nav cues, `MessageBandeau` migration. Biggest visible win, least risk. Includes the tuning QA budget.
- **Phase C — Voiceover (Keyboard + Translation).** `WebSpeechVoiceProvider`, two play moments, stop-on-input, gesture priming. Subject to the escape hatch above.
- **Phase D (later) — Recorded/generated voices.** Pre-generate audio per item+lang from seed vocabulary, cache via the bundle mechanism, swap provider. Extend voiceover to Words. Revisit ducking.
- **Phase E (later) — Ambient music, hub/map screens only.** Never during learning tasks. Needs its own decisions when reached: asset sourcing, own toggle vs. master switch, cache strategy alongside bundles.

## 10. Explicitly out of scope (v0.1)

- Background music during learning tasks (permanently); ambient hub music (deferred to Phase E).
- Voice input from the child (spec: none).
- Recorded human voice production (Phase D).
