# Gabee Kid App — Audio Features Implementation Plan

**Status: DRAFT** · v0.1 · scope = plan only, no code written yet
**Grounded in:** product-spec-v0.1 §4.7 (Voiceover), §7.3 (Kid settings), §15 (Identity); design-spec §Bee; and the current `apps/kid` codebase.

Locked decisions (this session):
- **Voice source:** start with **TTS behind a clean abstraction**, upgrade to recorded voices later without touching call sites.
- **Build scope:** **plan only** for now; decide implementation scope after review.
- **SFX style:** **procedural** (code-generated tones), consistent with the existing `playMsgDing`.

---

## 1. What already exists (don't rebuild)

- **Procedural audio precedent:** `src/lib/messages.ts → playMsgDing()` synthesizes a two-note chime via `AudioContext`, reuses a shared `window.__gabeeAudio` context, resumes if suspended, and swallows gesture-gate errors. This is the template for the whole SFX layer.
- **Settings flag, already in the type system:** `packages/types/src/progress.ts` → `ChildProfileSchema.audio_enabled: z.boolean().default(true)`.
- **API contract, already defined:** `PATCH /api/profiles/:id` (`UpdateProfileRequestSchema`) already accepts `audio_enabled`. No backend/type work needed to persist the toggle.
- **Icons, already drawn:** `src/components/Icon.tsx` has `'sound'` and `'sound-off'`.
- **Spec placement:** product-spec §7.3 already lists "Audio (voiceover) on/off" as a kid-accessible setting.
- **Feedback states, already wired:** every session screen tracks `feedback: 'correct' | 'wrong' | null` and drives Bee expressions + coach text (e.g. `NumbersSession.tsx`). These are the exact hook points for SFX — no new state needed.
- **i18n spoken strings exist:** `excellent` ("Excellent!"), `correctMsg` ("Bravo ! Bonne réponse."), `youCanDoIt` — reusable as voiceover phrases.

Net: the data model, API, icons, and feedback hooks are already in place. The missing pieces are the audio engine, the toggle UI + preference plumbing, and the per-cue integration.

---

## 2. Architecture — one audio module, two layers

Create `src/lib/audio/` as the single audio boundary. Everything else imports from here; no screen ever touches `AudioContext` or a TTS API directly.

```
src/lib/audio/
  index.ts        // public API: sfx(), speak(), stopSpeaking(), setEnabled(), isEnabled()
  context.ts      // shared AudioContext (absorb window.__gabeeAudio), unlock-on-gesture
  sfx.ts          // procedural cue synths (correct, wrong, tap, unlock, milestone…)
  voice.ts        // narration provider interface + TTS implementation
  prefs.ts        // audio-enabled preference (read/write, offline-first)
```

**Key design rule (enables the "upgrade later" decision):** `voice.ts` exposes a provider interface, not a concrete engine.

```ts
interface VoiceProvider {
  speak(text: string, lang: 'fr' | 'en'): Promise<void>;
  stop(): void;
  warm?(): void; // optional preload/priming
}
```

v0.1 ships `WebSpeechVoiceProvider` (browser `speechSynthesis`). Swapping to `RecordedVoiceProvider` (bundled/cached MP3s via Howler) or `TtsFileProvider` later is a one-line provider switch — call sites (`speak(word, lang)`) never change.

---

## 3. The preference: `audio_enabled` (offline-first)

Constraint: kid app is offline-first and `store.profile` is **not persisted** (re-picked each launch). So the toggle can't rely on a live profile object or the network.

Plan:
- Add a **device-local persisted pref** mirroring how `lang` is handled in `src/store.ts` — add `audioEnabled: boolean` to the store and to `partialize` so it survives reloads via `localStorage`.
- **Seed** it from `profile.audio_enabled` on profile select (default `true`).
- On toggle: (1) flip the local pref immediately (instant, works offline), (2) best-effort `PATCH /api/profiles/:id { audio_enabled }` when online (add a small `updateProfile` helper to `src/lib/api.ts` — none exists yet). Failure is non-fatal; local pref is source of truth on-device.
- `audio.isEnabled()` reads this pref; every `sfx()`/`speak()` no-ops when disabled.

---

## 4. SFX layer (procedural)

A small cue catalog, each a short synthesized envelope built the same way as `playMsgDing`. Suggested starter set (tunable, keep them soft and short — 150–500ms):

| Cue | Fires on | Character |
|---|---|---|
| `correct` | `feedback === 'correct'` in every `*Session.tsx` | bright rising two-note (reuse the A5→E6 motif family) |
| `wrong` | `feedback === 'wrong'` | soft low "boop", **encouraging not buzzer** (spec: never punitive) |
| `tap` | primary button / answer select | very short tick, low volume |
| `navSelect` | `BottomNav` tab change | subtle blip |
| `unlock` | level/lesson unlock on map screens | small sparkle arpeggio |
| `milestone` | `MilestoneCelebration`, badge award, `Coffre`/`GiftCard` | fuller celebratory sting |
| `sessionStart` | session begins (optional) | gentle "here we go" |

**Integration points (real files):**
- Sessions: `NumbersSession`, `WordsRead/Fill/Build/PictureSession`, `CodeTurtle/WorldSession`, `KeyboardStatic/ScrollingSession`, `TranslationSession` — call `sfx('correct'|'wrong')` where `setFeedback(...)` already runs.
- Maps/rewards: `MilestoneCelebration.tsx`, `BadgeRow.tsx`, `Coffre.tsx`, `GiftCard.tsx`, the `*LevelMap`/`*LessonMap` unlock transitions.
- Nav: `BottomNav.tsx`.
- **Migrate** `playMsgDing` in `MessageBandeau.tsx` to `sfx('message')` so all audio flows through one engine (keep the exact current tones).

**Central volume/ducking:** SFX should duck (or defer) while narration is speaking so they don't collide.

---

## 5. Voiceover layer (TTS now, recorded later)

Per spec §4.7 — **primary scope: Keyboard + Translation** (other modules later). Two play moments:
1. **On prompt appears** — read the word/prompt aloud in the item's language.
2. **On success** — read the word again, then a spoken **"Bravo !"** (reuse i18n).

Behaviour rules from the spec (must honor):
- **Never blocks input.** If the child taps/types during narration → `audio.stopSpeaking()` immediately, play continues. Wire this into the existing key/tap handlers of the Keyboard and Translation sessions.
- **Respects the toggle** (`audio_enabled`).
- **Gesture-gated:** `speechSynthesis` (like `AudioContext`) needs a first user gesture; prime the provider on the first tap of a session (`warm()`), swallow failures silently.

**Language:** pass the item's language to `speak(text, lang)`; `WebSpeechVoiceProvider` picks a matching `fr`/`en` `SpeechSynthesisVoice`. Fall back gracefully if the device lacks one.

**Upgrade path (no call-site changes):** later, generate or record MP3s keyed by item id + lang, cache them via the service worker bundle mechanism (same pattern as question bundles in `src/lib/bundles.ts`), and swap the provider.

---

## 6. Offline / PWA notes

- Procedural SFX = **zero assets, perfect offline** (a reason procedural was chosen).
- Browser TTS quality/availability varies and some platforms need network — acceptable for v0.1 as the explicit fallback; the recorded/generated-file upgrade removes this dependency and should be cached alongside question bundles.
- No new files to precache for v0.1 (nothing to add to the Workbox manifest yet).

---

## 7. Accessibility & UX guardrails

- Audio is **opt-out** (`audio_enabled` defaults `true`) but the toggle must be one tap in kid Settings.
- Keep cues **short, soft, non-startling**; wrong-answer cue is gentle, never a harsh buzzer (brand: encouraging).
- Consider honoring a "reduced audio" instinct the way CSS already honors `prefers-reduced-motion` (`gabee.css` line ~366) — at minimum, never autoplay loud.
- All audio calls are fire-and-forget and error-swallowing: audio must **never** break a render or block gameplay.

---

## 8. Proposed build sequence (when we implement)

Phased so each phase is shippable on its own:

**Phase A — Engine + toggle (foundation).**
`src/lib/audio/*`, absorb `playMsgDing`, add `audioEnabled` to store + persist, add kid-Settings toggle (`sound`/`sound-off` icon) + `updateProfile` API helper. No behaviour change yet beyond the toggle.

**Phase B — SFX pass.**
Wire `correct`/`wrong` into all sessions, then rewards/unlock/nav cues. This is the biggest visible win for the least risk.

**Phase C — Voiceover (Keyboard + Translation).**
`WebSpeechVoiceProvider`, the two play moments, stop-on-input, gesture priming.

**Phase D (later) — Recorded/generated voices.**
Swap provider, add cached audio bundles, extend voiceover to Words.

Each phase ends with a verification step: manual QA on a touch device (gesture gating, toggle off = silence, narration stops on input) + a typecheck/lint pass.

---

## 9. Open questions for Valentine

1. Confirm SFX scope for first pass — all sessions at once, or Keyboard/Translation only to match the voiceover scope?
2. Wrong-answer cue: silent, or a gentle non-punitive tone? (Spec implies gentle; confirm.)
3. Should the kid Settings toggle also expose a separate SFX-vs-voice split, or one master `audio_enabled` switch (spec = one switch)?
4. Any brand sound identity from §15 to match (the message ding's A5→E6 motif as the sonic signature)?

## 10. Explicitly out of scope (v0.1)

- Background music / ambient loops (not in spec).
- Voice **input** from the child (spec: none).
- Recorded human voice production (deferred to Phase D).
