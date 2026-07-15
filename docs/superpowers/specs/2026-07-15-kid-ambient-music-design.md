# Gabee Kid App — Ambient Music (Audio Phase E) Design

**Status: APPROVED** · 2026-07-15
**Grounded in:** audio design spec `2026-07-13-kid-audio-design.md` §9 Phase E (deliberately deferred there); the merged audio engine (`apps/kid/src/lib/audio/`, PR #6); the e2e infra (`e2e/`, PR #9).
**Branch:** `feat/kid-ambient-music` (based on `main`, which contains both).

## Decisions (all resolved with Valentine, 2026-07-15)

| Decision | Choice |
|---|---|
| Asset source | Valentine generates with AI (Suno or similar) from the brief in §5 |
| Where music plays | Everywhere EXCEPT session screens — hubs, sub-hubs, level/lesson maps, Carte, Coffre, Settings, Summary. Never during an exercise (absolute rule) |
| Settings | Separate "Musique d'ambiance" switch under the master "Sons et voix"; master OFF silences everything, music switch only silences ambience |
| Persistence | Per-profile `music_enabled` field — exact same pattern as `audio_enabled` (schema + types + PATCH + seed-on-select + best-effort sync) |
| Playback | Web Audio (`AudioBufferSourceNode.loop`) — the only guaranteed gapless loop; asset bundled + precached (no runtime download mechanism — YAGNI until Phase D wants one) |
| Ducking | None in v1 — cues (nav blips, milestone sting on Summary) play over the soft music |
| Tests | Unit (node:test) + module tests with a fake AudioContext + automated Playwright e2e — user-required, not optional |

## 1. Engine — `apps/kid/src/lib/audio/music.ts`

Behind the existing audio boundary; screens never import it directly.

- Lazy: fetch + `decodeAudioData` of the bundled asset on first need; the decoded `AudioBuffer` is kept for the app's lifetime (one loop ≈ a few MB decoded — fine).
- Playback: `AudioBufferSourceNode` with `loop = true` on the shared `getAudioContext()`, through a dedicated `GainNode`.
- Levels/fades: volume 0.22; fade-in/out 0.8 s via `linearRampToValueAtTime`. Stop = fade to 0 then `source.stop()`.
- Gesture gating: if the AudioContext is locked (no user gesture yet), starting is a silent no-op and is retried on the next zone evaluation or user interaction — cold-launching onto the Hub starts the music at the first tap. No errors surface, ever (module-wide rule).
- Pure, exported decision function for tests: `shouldPlayMusic(zone, masterEnabled, musicEnabled): boolean`.

`index.ts` (public surface) adds exactly one function: `setMusicZone(zone: 'ambient' | 'silent')` — idempotent, cheap, never throws. It re-reads prefs on every call, so toggling Settings mid-hub takes effect at the next zone evaluation; the Settings toggle handlers also call it directly for immediate effect (§4).

## 2. Zoning — one effect in App.tsx

A single `useEffect` observing `route.name`:

- `silent` for every session route (the exact set is centralized in an exported `SESSION_ROUTES`/predicate next to the router, unit-tested against the router's route names so a future session screen can't silently leak music).
- `ambient` for everything else (hub, sub-hubs, level/lesson maps, carte/carte_road, coffre, settings, summaries, profile select).
- Unmount/logout → `silent`.

Summary screens are ambient: the milestone sting plays over the 0.22-gain music; no ducking in v1.

## 3. Preference — `music_enabled`, per profile

Carbon copy of the `audio_enabled` plumbing (all patterns already shipped and reviewed):

- `packages/db`: `musicEnabled Boolean @default(true)` on `child_profiles` + migration.
- `packages/types`: `music_enabled` in `ChildProfileSchema` (default `true`), `UpdateProfileRequestSchema`, `CreateProfileRequestSchema` (optional).
- `apps/web`: mapper + create/update services pass it through (parent UI unchanged — parent-side controls remain Phase D).
- `apps/kid` store: `musicEnabled` state + `setMusicEnabled`, in `partialize`, seeded from `profile.music_enabled` in `setProfile`, kept in sync both ways (same star-spread-safe semantics as `audioEnabled`, extended in the same store test file).
- Settings toggle: flip locally first, best-effort `api.updateProfile(profile.id, { music_enabled: next })`, failure non-fatal.
- Gate: music plays iff `audioEnabled && musicEnabled` (master wins). Same known v0.1 limitation as audio_enabled: offline toggle + failed PATCH reverts on next profile re-select (accepted, documented in the audio spec §3).

## 4. Kid Settings UI

Inside the existing "Sons et voix" card in `apps/kid/src/screens/Settings.tsx`: a second row "Musique d'ambiance" with its own button (music-note/`sound-off`-style icon), visually subordinate; disabled (greyed, non-interactive) while the master is OFF. Turning music ON while on the Settings screen starts the ambience immediately (Settings is an ambient zone — instant feedback, no extra confirmation blip needed); turning it OFF fades it out. i18n keys FR/EN under `settings.` (`musicTitle`, `musicOn`, `musicOff`).

## 5. Asset + generation brief (Valentine's side)

One file: `apps/kid/src/assets/music/ambient-hub.m4a` (Vite hashes it; imported URL).

**Suno/AI brief:**
- Instrumental only, no vocals, no percussion hits that startle.
- Palette: soft ukulele / marimba / music box / light pads — warm, curious, "friendly bee garden".
- Key **A major** (ties into the A5→E6 sonic identity of the cues); tempo ~90–100 BPM.
- 60–90 seconds, **composed to loop**: no intro, no outro, no final cadence, flat dynamics (no build-ups) — the last bar must flow back into the first.
- Generate at the highest quality offered, then convert/trim:
  `ffmpeg -i input.wav -c:a aac -b:a 96k -movflags +faststart apps/kid/src/assets/music/ambient-hub.m4a`
  Target ≤ 1.5 MB. If the seam is audible, trim to an exact bar boundary (`-ss`/`-t`) before converting; final loop check happens in-app during QA.
- Until the real asset lands, implementation uses any placeholder m4a under the same path (mechanics don't change).

## 6. Offline / PWA

- Add `m4a` to the Workbox `globPatterns` in `apps/kid/vite.config.ts` → the loop is precached at install like the app shell. Zero runtime network dependency.
- Check `maximumFileSizeToCacheInBytes` if the asset exceeds Workbox's 2 MB default (target size stays under it).

## 7. Testing (user-required: unit + e2e, automated)

Three layers, wired into the existing runners (explicit file lists in `apps/kid/package.json`; e2e in `e2e/tests/`):

1. **Unit (plain node:test)** — `apps/kid/src/lib/audio/music.test.ts`:
   - `shouldPlayMusic` truth table (zone × master × music).
   - Route classification: every session-route name → silent, every other route name from the router → ambient (guards future screens).
2. **Module test with fake AudioContext (test:dom)** — extend the fake-audio pattern from `index.test.tsx`:
   - `setMusicZone('ambient')` with prefs on → creates a looping source (`loop === true`) with gain ramp up.
   - `setMusicZone('silent')` → gain ramp down + source stopped.
   - Master or music pref off → no source ever created; toggling music off while playing stops it.
   - Locked context (fake `resume` rejecting / state 'suspended') → no throw, retry works after unlock.
   - Store test additions: `musicEnabled` seeding/toggle/spread-survival (same file as the audioEnabled tests).
3. **e2e (Playwright, `e2e/tests/kid-ambient-music.spec.ts`)** — reuses the login/profile flow from `kid-offline-sync.spec.ts` and an `addInitScript` AudioContext instrumentation (records created buffer sources + loop flag + gain values, the pattern proven by the audio-QA driver):
   - Hub after first tap → a looping music source is live.
   - Entering a session → music source stopped; finishing/backing out to the map → a new looping source starts.
   - Settings: music switch OFF → no music source on hub, but a cue (nav blip) still fires; master OFF → neither.
   - Runs in the existing CI e2e job (no config change expected — same project/webServer).

Real loop seamlessness and taste stay manual QA (they are inherently audible qualities).

## 8. Explicitly out of scope

- Ducking under narration/stings (revisit with Phase D).
- Per-area tracks (one loop everywhere in v1; the engine takes an asset URL so adding variants later is additive).
- Parent-app music controls (Phase D `audio_prefs` page).
- Runtime-downloadable music bundles (YAGNI until Phase D builds asset delivery).
