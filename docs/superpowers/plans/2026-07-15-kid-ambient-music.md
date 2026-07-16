# Kid Ambient Music (Audio Phase E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gapless ambient music on every non-session screen of the kid app, gated by a per-profile `music_enabled` pref under the master audio switch, precached for offline — with unit, fake-AudioContext, and Playwright e2e coverage (spec: `docs/superpowers/specs/2026-07-15-kid-ambient-music-design.md`).

**Architecture:** A `music.ts` module behind the existing `apps/kid/src/lib/audio/` boundary plays a bundled loop via `AudioBufferSourceNode.loop` + `GainNode` fades on the shared AudioContext. One `useEffect` in App.tsx maps `route.name` → `setMusicZone('ambient'|'silent')` via an exported, unit-tested `isSessionRoute` predicate. The pref replicates the shipped `audio_enabled` plumbing end-to-end (Prisma → types → web services → kid store → Settings).

**Tech Stack:** React 19, zustand 5 (persist), Web Audio, Prisma 7, zod, node:test via tsx, Playwright e2e (`e2e/`), vite-plugin-pwa/Workbox.

## Global Constraints

- **Workspace:** the worktree `/Users/valentine/dev/gabee/.claude/worktrees/kid-ambient-music`, branch `feat/kid-ambient-music` (based on `main`). Run all commands from the WORKTREE root. Never touch the main checkout (a concurrent session owns it).
- Kid/web/types tests are **glob-discovered** (`find src -name '*.test.ts(x)'` in each package.json; types = the single `test/contracts.test.ts`). New `apps/kid/src/**/*.test.ts` / `.test.tsx` files run automatically — no script edits.
- Verify commands: `pnpm --filter @gabee/kid test|test:dom|typecheck|lint`, `pnpm --filter @gabee/types test`, `pnpm --filter @gabee/web typecheck|test`. Do NOT run `vite build` locally (rollup native binding is CI-only on this machine).
- All audio calls fire-and-forget and error-swallowing — music must never break a render, block input, or surface a rejection (audio spec §7 rule carries over).
- Music behavior constants (spec): volume **0.22**, fades **0.8 s**, loop **gapless** (`AudioBufferSourceNode.loop = true`), plays iff `audioEnabled && musicEnabled`, zone rule "every session route is silent, everything else ambient".
- Placeholder asset: `apps/kid/public/music/ambient-hub.wav` (script-generated; ffmpeg is NOT installed). The real Suno-generated `ambient-hub.m4a` will replace it later — keep the URL in ONE constant (`MUSIC_URL` in music.ts).
- Prisma migration runs against the local dev DB via `packages/db/.env` (present in the worktree).
- i18n: FR is primary copy, EN mirrors; keys live under `settings.` in `apps/kid/src/i18n.ts` (FR block ~line 77, EN block ~line 277 — locate by `settings: {`).
- Commit after every task; never `git add` untracked files outside the task's list.

---

### Task 1: Placeholder loop asset + Workbox precache + spec touch-up

**Files:**
- Create: `apps/kid/public/music/ambient-hub.wav` (generated)
- Modify: `apps/kid/vite.config.ts` (globPatterns line ~48)
- Modify: `docs/superpowers/specs/2026-07-15-kid-ambient-music-design.md` (§7 stale sentence)

**Interfaces:**
- Consumes: nothing.
- Produces: the asset at public URL `/music/ambient-hub.wav` (dev + built app); Workbox precaches `m4a`/`wav`. Task 5's `MUSIC_URL = '/music/ambient-hub.wav'` depends on this exact path.

- [ ] **Step 1: Generate the placeholder loop** (soft A-major arpeggio, 4 s, mono 16-bit WAV, per-note fades so the loop seam doesn't click):

```bash
mkdir -p apps/kid/public/music && cat > /tmp/gen-ambient.mjs << 'EOF'
import { writeFileSync, mkdirSync } from 'node:fs';
const SR = 44100, DUR = 4, N = SR * DUR;
const notes = [440, 554.37, 659.25, 880]; // A4 C#5 E5 A5 — the cues' motif family
const noteLen = N / notes.length, fade = SR * 0.03, amp = 0.12;
const pcm = new Int16Array(N);
for (let i = 0; i < N; i++) {
  const n = Math.min(notes.length - 1, Math.floor(i / noteLen));
  const tIn = i - n * noteLen;
  let env = 1;
  if (tIn < fade) env = tIn / fade;
  if (noteLen - tIn < fade) env = (noteLen - tIn) / fade;
  pcm[i] = Math.round(Math.sin((2 * Math.PI * notes[n] * i) / SR) * amp * env * 32767);
}
const data = Buffer.from(pcm.buffer);
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32);
h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
writeFileSync('apps/kid/public/music/ambient-hub.wav', Buffer.concat([h, data]));
console.log('wrote', 44 + data.length, 'bytes');
EOF
node /tmp/gen-ambient.mjs && rm /tmp/gen-ambient.mjs
```

Expected: `wrote 352844 bytes` (~345 KB).

- [ ] **Step 2: Add audio extensions to the Workbox precache.** In `apps/kid/vite.config.ts`, change:

```ts
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
```
to
```ts
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,m4a,wav}'],
```

- [ ] **Step 3: Fix the stale spec sentence.** In `docs/superpowers/specs/2026-07-15-kid-ambient-music-design.md` §7, replace “wired into the existing runners (explicit file lists in `apps/kid/package.json`; e2e in `e2e/tests/`)” with “wired into the existing runners (test files are glob-discovered by the package.json scripts; e2e in `e2e/tests/`)”.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @gabee/kid typecheck && ls -la apps/kid/public/music/`
Expected: clean typecheck; `ambient-hub.wav` ≈ 345 KB.

- [ ] **Step 5: Commit**

```bash
git add apps/kid/public/music/ambient-hub.wav apps/kid/vite.config.ts docs/superpowers/specs/2026-07-15-kid-ambient-music-design.md
git commit -m "feat(kid/music): placeholder ambient loop asset + audio precache globs"
```

---

### Task 2: `music_enabled` — schema, migration, types (TDD via contracts test)

**Files:**
- Modify: `packages/types/test/contracts.test.ts` (extend `describe('ChildProfile')`, line ~285)
- Modify: `packages/db/prisma/schema.prisma` (ChildProfile model, after `audioEnabled` line 314)
- Create: migration via `prisma migrate dev`
- Modify: `packages/types/src/progress.ts:129` area, `packages/types/src/api/profiles.ts` (Create ~line 30, Update ~line 57)

**Interfaces:**
- Consumes: existing `ChildProfileSchema`, `CreateProfileRequestSchema`, `UpdateProfileRequestSchema`.
- Produces: `music_enabled: boolean` on `ChildProfile` (default `true`), optional on Create, accepted by Update. Prisma model field `musicEnabled` mapped to column `music_enabled`. Tasks 3–4 and 8 rely on these exact names.

- [ ] **Step 1: Write the failing tests.** Inside the existing `describe('ChildProfile', …)` block in `packages/types/test/contracts.test.ts` (reuse the fixture object the block's first test parses — extend, don't invent a new fixture shape), add:

```ts
  it('defaults music_enabled to true (audio phase E)', () => {
    // Reuse the block's existing minimal valid profile fixture:
    const parsed = ChildProfileSchema.parse({ ...existingFixtureUsedAbove });
    assert.equal(parsed.music_enabled, true);
  });

  it('UpdateProfileRequest carries music_enabled through', () => {
    const parsed = UpdateProfileRequestSchema.parse({ music_enabled: false });
    assert.equal(parsed.music_enabled, false);
  });
```

`...existingFixtureUsedAbove` means: copy the exact object literal (or variable) the block's first passing test feeds to `ChildProfileSchema.parse`. Add `UpdateProfileRequestSchema` to the file's `../src/index` import list.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @gabee/types test`
Expected: FAIL — `parsed.music_enabled` is `undefined` in both new tests (zod strips unknown keys).

- [ ] **Step 3: Schema + migration.** In `packages/db/prisma/schema.prisma`, directly under the `audioEnabled` line (314):

```prisma
  musicEnabled                Boolean                 @default(true) @map("music_enabled")
```

Run: `pnpm --filter @gabee/db exec prisma migrate dev --name child_music_enabled`
Expected: new folder under `packages/db/prisma/migrations/`, client regenerated, dev DB updated.

- [ ] **Step 4: Types.** In `packages/types/src/progress.ts`, under `audio_enabled` (line 129):

```ts
  music_enabled: z.boolean().default(true),
```

In `packages/types/src/api/profiles.ts` — under `audio_enabled` in `CreateProfileRequestSchema` (~line 30):

```ts
  music_enabled: z.boolean().optional(),
```

and under `audio_enabled` inside `UpdateProfileRequestSchema`'s object (~line 57):

```ts
    music_enabled: z.boolean(),
```

(the whole object is already `.partial()` — same as `audio_enabled`).

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @gabee/types test && pnpm --filter @gabee/types typecheck`
Expected: PASS (all, including the 2 new) + clean.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/types/src/progress.ts packages/types/src/api/profiles.ts packages/types/test/contracts.test.ts
git commit -m "feat(types,db): per-profile music_enabled flag (default true) + migration"
```

---

### Task 3: Web API passthrough

**Files:**
- Modify: `apps/web/src/lib/server/mappers.ts` (row type line ~30, mapping line ~65)
- Modify: `apps/web/src/lib/server/services/profiles.ts` (create ~line 103, update ~line 155)

**Interfaces:**
- Consumes: Prisma `musicEnabled` + types `music_enabled` from Task 2.
- Produces: `music_enabled` round-trips through `GET/POST/PATCH /api/profiles` — Task 8's kid-side PATCH and the e2e fixture rely on it.

- [ ] **Step 1: Mapper.** In `mappers.ts`, mirror `audioEnabled` exactly: add `musicEnabled: boolean;` to the row type next to `audioEnabled: boolean;` (line 30), and `music_enabled: row.musicEnabled,` next to `audio_enabled: row.audioEnabled,` (line 65).

- [ ] **Step 2: Services.** In `services/profiles.ts` — create path (line ~103), next to the audio line:

```ts
        musicEnabled: input.music_enabled ?? true,
```

update path (line ~155), next to the audio spread:

```ts
      ...(input.music_enabled !== undefined ? { musicEnabled: input.music_enabled } : {}),
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @gabee/web typecheck && pnpm --filter @gabee/web test`
Expected: clean + existing suites pass (round-trip behavior gets end-to-end coverage in Task 9).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/server/mappers.ts apps/web/src/lib/server/services/profiles.ts
git commit -m "feat(web/profiles): pass music_enabled through create/update/read"
```

---

### Task 4: Kid store pref (TDD)

**Files:**
- Modify: `apps/kid/src/store.audio.test.tsx` (extend)
- Modify: `apps/kid/src/store.ts` (interface ~45–56, defaults ~72, `setProfile`/`setAudioEnabled` ~90–97, `partialize` line 117)

**Interfaces:**
- Consumes: `profile.music_enabled` (Task 2).
- Produces: store fields `musicEnabled: boolean` + `setMusicEnabled(v: boolean): void`, persisted and profile-seeded. Tasks 5 and 8 read them.

- [ ] **Step 1: Write the failing tests.** In `apps/kid/src/store.audio.test.tsx`, extend the existing describe (reuse its `kid(...)` fixture helper — add `music_enabled: true` to the fixture base object):

```tsx
  it('seeds musicEnabled from profile.music_enabled on select', () => {
    useStore.getState().setProfile(kid({ music_enabled: false }));
    assert.equal(useStore.getState().musicEnabled, false);
    useStore.getState().setProfile(kid({ music_enabled: true }));
    assert.equal(useStore.getState().musicEnabled, true);
  });

  it('setMusicEnabled flips pref AND profile copy so star-spreads keep it', () => {
    useStore.getState().setProfile(kid({ music_enabled: true }));
    useStore.getState().setMusicEnabled(false);
    const s = useStore.getState();
    assert.equal(s.musicEnabled, false);
    assert.equal(s.profile?.music_enabled, false);
    s.setProfile({ ...s.profile!, total_stars: 5 });
    assert.equal(useStore.getState().musicEnabled, false);
  });
```

Also add `musicEnabled: true` to the `beforeEach` reset object.

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @gabee/kid test:dom`
Expected: FAIL — `setMusicEnabled is not a function`.

- [ ] **Step 3: Implement.** In `apps/kid/src/store.ts`, mirroring `audioEnabled` exactly:
- Interface, under `audioEnabled: boolean;`:
```ts
  /** Ambient music switch (audio phase E) — plays only when audioEnabled is also true. Same "last selected kid's pref" semantics. */
  musicEnabled: boolean;
```
- Interface actions, under `setAudioEnabled`: `setMusicEnabled: (v: boolean) => void;`
- Defaults, under `audioEnabled: true,`: `musicEnabled: true,`
- Replace `setProfile` so it seeds BOTH flags:
```ts
      setProfile: (profile) =>
        set(profile
          ? { profile, audioEnabled: profile.audio_enabled, musicEnabled: profile.music_enabled }
          : { profile }),
```
- Under `setAudioEnabled`, add:
```ts
      setMusicEnabled: (v) =>
        set((s) => ({
          musicEnabled: v,
          profile: s.profile ? { ...s.profile, music_enabled: v } : s.profile,
        })),
```
- `partialize`: add `musicEnabled: s.musicEnabled,`.

- [ ] **Step 4: Verify pass**

Run: `pnpm --filter @gabee/kid test:dom && pnpm --filter @gabee/kid typecheck`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add apps/kid/src/store.ts apps/kid/src/store.audio.test.tsx
git commit -m "feat(kid/store): musicEnabled pref — persisted, profile-seeded, spread-safe"
```

---

### Task 5: Music engine + route predicate (TDD, plain node:test)

**Files:**
- Create: `apps/kid/src/lib/audio/music.test.ts`
- Create: `apps/kid/src/lib/audio/music.ts`
- Modify: `apps/kid/src/lib/router.ts` (add exported predicate near the top, after the `Route` type)
- Modify: `apps/kid/src/lib/audio/prefs.ts` (add `isMusicEnabled`)

**Interfaces:**
- Consumes: `getAudioContext()` from `./context`, `isEnabled` from `./prefs`, store `musicEnabled` (Task 4).
- Produces:
  - `router.ts`: `isSessionRoute(name: Route['name']): boolean`
  - `prefs.ts`: `isMusicEnabled(): boolean`
  - `music.ts`: `type MusicZone = 'ambient' | 'silent'`; `shouldPlayMusic(zone: MusicZone, master: boolean, music: boolean): boolean` (pure); `setMusicZone(zone: MusicZone): void`; `reevaluateMusic(): void`; `MUSIC_URL` constant. Task 6 wraps these in index.ts.
- **Node-safety rule:** `music.ts` must not touch `window`/`fetch`/AudioContext at module scope — only inside functions (the unit test imports it under plain node).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @gabee/kid test`
Expected: FAIL — `Cannot find module './music'`.

- [ ] **Step 3: Implement the predicate.** In `apps/kid/src/lib/router.ts`, directly after the `Route` type definition:

```ts
/** Ambient music is silenced on every exercise screen (audio phase E spec §2). */
export function isSessionRoute(name: Route['name']): boolean {
  return name === 'session' || name.endsWith('_session');
}
```

In `apps/kid/src/lib/audio/prefs.ts`, next to `isEnabled`:

```ts
export function isMusicEnabled(): boolean {
  return useStore.getState().musicEnabled;
}
```

- [ ] **Step 4: Implement the engine**

```ts
// apps/kid/src/lib/audio/music.ts
// Ambient-music layer (audio phase E spec §1). One bundled loop, played
// gaplessly via AudioBufferSourceNode.loop on the shared context, gated by
// zone (App.tsx routing) × master switch × music switch. Module-wide rule:
// fire-and-forget, error-swallowing, nothing at module scope touches window.
import { getAudioContext } from './context';
import { isEnabled, isMusicEnabled } from './prefs';

export type MusicZone = 'ambient' | 'silent';

/** URL is a public/ asset (plain string — node-safe, precached by Workbox).
 *  Placeholder .wav until the Suno-generated ambient-hub.m4a lands (spec §5). */
export const MUSIC_URL = '/music/ambient-hub.wav';
const VOLUME = 0.22;
const FADE_S = 0.8;

/** Pure gate — unit-tested; the only decision logic in this module. */
export function shouldPlayMusic(zone: MusicZone, master: boolean, music: boolean): boolean {
  return zone === 'ambient' && master && music;
}

let zone: MusicZone = 'silent';
let buffer: AudioBuffer | null = null;
let loading = false;
let source: AudioBufferSourceNode | null = null;
let gain: GainNode | null = null;

async function ensureBuffer(): Promise<AudioBuffer | null> {
  if (buffer) return buffer;
  if (loading) return null; // a concurrent load will re-evaluate when done
  loading = true;
  try {
    const ctx = getAudioContext();
    if (!ctx) return null;
    const res = await fetch(MUSIC_URL);
    buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    return buffer;
  } catch {
    return null; // missing/undecodable asset must never break the app
  } finally {
    loading = false;
    // The zone may have changed while decoding — settle to the correct state.
    reevaluateMusic();
  }
}

/** One-shot: when the context is gesture-locked, retry at the next user gesture. */
let unlockArmed = false;
function armUnlockRetry(): void {
  if (unlockArmed || typeof document === 'undefined') return;
  unlockArmed = true;
  const onGesture = () => {
    document.removeEventListener('pointerdown', onGesture);
    document.removeEventListener('keydown', onGesture);
    unlockArmed = false;
    const ctx = getAudioContext(); // getAudioContext() resumes a suspended context
    void ctx?.resume?.().catch(() => {}).finally?.(reevaluateMusic);
    reevaluateMusic();
  };
  document.addEventListener('pointerdown', onGesture);
  document.addEventListener('keydown', onGesture);
}

function start(): void {
  if (source) return; // already playing
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') {
    // Autoplay policy: locked until a user gesture — retry on the next one
    // (a cold launch onto the hub must start music at the first tap, spec §1).
    armUnlockRetry();
    return;
  }
  if (!buffer) {
    void ensureBuffer();
    return; // ensureBuffer's finally() re-evaluates once decoded
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + FADE_S);
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.connect(g);
  g.connect(ctx.destination);
  s.start();
  source = s;
  gain = g;
}

function stop(): void {
  const ctx = getAudioContext();
  const s = source, g = gain;
  source = null;
  gain = null;
  if (!s) return;
  try {
    if (ctx && g) {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_S);
      s.stop(ctx.currentTime + FADE_S + 0.02);
    } else {
      s.stop();
    }
  } catch {
    /* stopping twice / dead context — ignore */
  }
}

/** Idempotent: reads zone × prefs and settles playback to match. */
export function reevaluateMusic(): void {
  try {
    if (shouldPlayMusic(zone, isEnabled(), isMusicEnabled())) start();
    else stop();
  } catch {
    /* music must never break a render */
  }
}

/** App.tsx routing calls this on every route change (spec §2). */
export function setMusicZone(next: MusicZone): void {
  zone = next;
  reevaluateMusic();
}
```

- [ ] **Step 5: Verify pass**

Run: `pnpm --filter @gabee/kid test && pnpm --filter @gabee/kid typecheck`
Expected: PASS (new music tests included) + clean.

- [ ] **Step 6: Commit**

```bash
git add apps/kid/src/lib/audio/music.ts apps/kid/src/lib/audio/music.test.ts apps/kid/src/lib/router.ts apps/kid/src/lib/audio/prefs.ts
git commit -m "feat(kid/music): gapless loop engine + pure gates + session-route predicate"
```

---

### Task 6: Public surface + fake-AudioContext module test (TDD, test:dom)

**Files:**
- Create: `apps/kid/src/lib/audio/music.dom.test.tsx`
- Modify: `apps/kid/src/lib/audio/index.ts`

**Interfaces:**
- Consumes: Task 5's `setMusicZone`/`reevaluateMusic`; Task 4's `setMusicEnabled` (store).
- Produces (index.ts — the ONLY import surface for screens):
  - `setMusicZone(zone: 'ambient' | 'silent'): void` (re-export)
  - `setMusicEnabled(v: boolean): void` — flips the store pref, then `reevaluateMusic()`
  - `setEnabled(v: boolean)` (existing master) additionally calls `reevaluateMusic()` so master-off kills music instantly (it already stops narration).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/kid/src/lib/audio/music.dom.test.tsx
// Engine behavior against a fake AudioContext + fake fetch (audio phase E spec
// §7.2): looping source on ambient, ramped stop on silent, hard gates off.
import '../../test/setup-dom';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

interface FakeSource {
  buffer: unknown; loop: boolean; started: boolean; stopped: boolean;
  connect: (n: unknown) => void; start: () => void; stop: () => void;
}

function installFakeAudio() {
  const state = { sources: [] as FakeSource[], ramps: [] as number[] };
  const fakeCtx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: () => Promise.resolve(),
    decodeAudioData: (_: ArrayBuffer) => Promise.resolve({ duration: 4 }),
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => {},
        cancelScheduledValues: () => {},
        linearRampToValueAtTime: (v: number) => state.ramps.push(v),
      },
      connect: () => {},
    }),
    createBufferSource: () => {
      const s: FakeSource = {
        buffer: null, loop: false, started: false, stopped: false,
        connect: () => {}, start: () => { s.started = true; }, stop: () => { s.stopped = true; },
      };
      state.sources.push(s);
      return s;
    },
  };
  (window as unknown as { __gabeeAudio?: unknown }).__gabeeAudio = fakeCtx;
  (globalThis as { fetch?: unknown }).fetch = () =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  return state;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('music engine (fake AudioContext)', () => {
  let audio: typeof import('./index');
  let state: ReturnType<typeof installFakeAudio>;

  beforeEach(async () => {
    state = installFakeAudio();
    audio = await import('./index');
    audio.setEnabled(true);
    audio.setMusicEnabled(true);
    audio.setMusicZone('silent'); // settle to a known state between tests
    await tick();
    state.sources.length = 0;
    state.ramps.length = 0;
  });

  it('ambient zone starts a looping source (after async decode)', async () => {
    audio.setMusicZone('ambient');
    await tick(); await tick(); // fetch → decode → reevaluate
    const s = state.sources.at(-1);
    assert.ok(s?.started, 'source started');
    assert.equal(s?.loop, true, 'loop must be gapless');
    assert.ok(state.ramps.includes(0.22), 'fade-in targets VOLUME');
  });

  it('silent zone stops the source with a fade-out ramp', async () => {
    audio.setMusicZone('ambient');
    await tick(); await tick();
    audio.setMusicZone('silent');
    const s = state.sources.at(-1);
    assert.ok(s?.stopped, 'source stopped');
    assert.ok(state.ramps.includes(0), 'fade-out targets 0');
  });

  it('music switch off prevents start and stops playback', async () => {
    audio.setMusicZone('ambient');
    await tick(); await tick();
    audio.setMusicEnabled(false);
    assert.ok(state.sources.at(-1)?.stopped, 'toggle-off stops music');
    state.sources.length = 0;
    audio.setMusicZone('ambient');
    await tick(); await tick();
    assert.equal(state.sources.length, 0, 'no source while music pref is off');
    audio.setMusicEnabled(true);
  });

  it('master switch off silences music too', async () => {
    audio.setMusicZone('ambient');
    await tick(); await tick();
    audio.setEnabled(false);
    assert.ok(state.sources.at(-1)?.stopped, 'master-off stops music');
    audio.setEnabled(true);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @gabee/kid test:dom`
Expected: FAIL — `audio.setMusicZone is not a function` / `setMusicEnabled is not a function`.

- [ ] **Step 3: Extend index.ts.** Add imports and exports (keep every existing export untouched):

```ts
import { setMusicZone as musicSetZone, reevaluateMusic, type MusicZone } from './music';
import { isEnabled, isMusicEnabled, setEnabled as setEnabledPref, setMusicEnabled as setMusicEnabledPref } from './prefs';
```

(prefs.ts gains a thin `setMusicEnabled(v)` wrapper calling `useStore.getState().setMusicEnabled(v)`, mirroring its existing `setEnabled`.) Then:

```ts
export type { MusicZone };
export { isMusicEnabled };

/** Route-driven music zoning; idempotent, never throws (spec §2). */
export function setMusicZone(zone: MusicZone): void {
  try {
    musicSetZone(zone);
  } catch {
    /* music must never break a render */
  }
}

/** Ambient-music switch: flip pref, settle playback immediately. */
export function setMusicEnabled(v: boolean): void {
  setMusicEnabledPref(v);
  reevaluateMusic();
}
```

and in the existing master `setEnabled(v)` body, after the narration stop, add `reevaluateMusic();`.

- [ ] **Step 4: Verify pass**

Run: `pnpm --filter @gabee/kid test:dom && pnpm --filter @gabee/kid test && pnpm --filter @gabee/kid typecheck`
Expected: all PASS (existing narration tests must be untouched) + clean.

- [ ] **Step 5: Commit**

```bash
git add apps/kid/src/lib/audio/music.dom.test.tsx apps/kid/src/lib/audio/index.ts apps/kid/src/lib/audio/prefs.ts
git commit -m "feat(kid/audio): music on the public surface — zoning, music switch, master-off kills music"
```

---

### Task 7: App.tsx zoning effect

**Files:**
- Modify: `apps/kid/src/App.tsx` (imports; one effect near the existing `route.name` effects, ~line 298–305)

**Interfaces:**
- Consumes: `setMusicZone` from `./lib/audio` (Task 6), `isSessionRoute` from `./lib/router` (Task 5), the existing `route` state.
- Produces: music follows navigation app-wide; silent on unmount.

- [ ] **Step 1: Wire the effect.** Add to App.tsx's imports: `setMusicZone` (from `./lib/audio`) and `isSessionRoute` (extend the existing `./lib/router` import). Near the other `route.name` effects (after the `setLastScreen` effect at ~line 298), add:

```ts
  // Ambient music follows navigation: exercise screens are silent, everything
  // else is ambient (audio phase E spec §2). Cleanup silences on unmount/logout.
  useEffect(() => {
    setMusicZone(isSessionRoute(route.name) ? 'silent' : 'ambient');
    return () => setMusicZone('silent');
  }, [route.name]);
```

(The cleanup also runs between route changes — `setMusicZone` is idempotent and the follow-up call settles the correct zone, so no flicker: fades are scheduled on the same gain until the source actually stops.)

**Nuance check during implementation:** verify the ProfileSelect/Login screens render OUTSIDE this component's route switch or under a route name in the ambient list; if App renders them before `route` exists, music simply stays silent until the hub — acceptable, no special-casing.

- [ ] **Step 2: Verify**

Run: `pnpm --filter @gabee/kid typecheck && pnpm --filter @gabee/kid lint && pnpm --filter @gabee/kid test:dom`
Expected: clean; the CodeTurtle component test (which mounts a session) still passes — `setMusicZone` must no-op safely under jsdom without real audio.

- [ ] **Step 3: Commit**

```bash
git add apps/kid/src/App.tsx
git commit -m "feat(kid): route-driven ambient music zoning — silent in sessions, ambient elsewhere"
```

---

### Task 8: Settings switch + i18n + PATCH

**Files:**
- Modify: `apps/kid/src/screens/Settings.tsx` (inside the existing "Sons et voix" card, lines ~140–160)
- Modify: `apps/kid/src/i18n.ts` (FR + EN `settings:` blocks)

**Interfaces:**
- Consumes: store `musicEnabled`, `setMusicEnabled` from `../lib/audio` (Task 6), `api.updateProfile` (exists), i18n keys added here.
- Produces: the kid-facing music switch, disabled while master is off.

- [ ] **Step 1: i18n keys.** FR `settings:` block (after `audioOff`):

```ts
        musicTitle: 'Musique d’ambiance',
        musicOn: 'Activée',
        musicOff: 'Coupée',
```

EN block (same position):

```ts
        musicTitle: 'Background music',
        musicOn: 'On',
        musicOff: 'Off',
```

- [ ] **Step 2: The switch.** In `Settings.tsx`: extend the audio import to `import { setEnabled, setMusicEnabled, sfx } from '../lib/audio';`, add the selector `const musicEnabled = useStore((s) => s.musicEnabled);`, and next to `toggleAudio()`:

```ts
  // Ambient-music sub-switch (audio phase E spec §4): same offline-first flow —
  // flip locally (setMusicEnabled also settles playback instantly), best-effort
  // PATCH. Settings is an ambient zone, so turning it ON is its own feedback.
  function toggleMusic() {
    const next = !musicEnabled;
    setMusicEnabled(next);
    if (profile) void api.updateProfile(profile.id, { music_enabled: next }).catch(() => {});
  }
```

Inside the existing "Sons et voix" card `<div>`, after the master row, add a second row (subordinate styling, disabled under master-off):

```tsx
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid #FDE68A', opacity: audioEnabled ? 1 : 0.45 }}>
              <div style={{ fontSize: 13 }}>{t('settings.musicTitle')}</div>
              <button
                className="btn ghost"
                onClick={toggleMusic}
                disabled={!audioEnabled}
                aria-pressed={musicEnabled}
              >
                <Icon name={musicEnabled ? 'sound' : 'sound-off'} size={16} />{' '}
                {musicEnabled ? t('settings.musicOn') : t('settings.musicOff')}
              </button>
            </div>
```

(No new icon glyph — reuse `sound`/`sound-off` at smaller size; a dedicated music-note icon is cosmetic and can ride a later design pass.)

The card layout must keep the master row intact — if the card's current root uses `justify-content: space-between` on a single row, wrap the existing title+button in one flex row `<div>` and stack the new row under it.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @gabee/kid typecheck && pnpm --filter @gabee/kid lint`
Expected: clean. (Behavioral proof lands in Task 9's e2e.)

- [ ] **Step 4: Commit**

```bash
git add apps/kid/src/screens/Settings.tsx apps/kid/src/i18n.ts
git commit -m "feat(kid/settings): ambient-music switch under the master audio card"
```

---

### Task 9: Playwright e2e

**Files:**
- Create: `e2e/tests/kid-ambient-music.spec.ts`

**Interfaces:**
- Consumes: `FIXTURES` from `../helpers/db` (tester1 parent + child Ava, seeded by global-setup); the app behavior from Tasks 1–8. Login lines mirror `kid-offline-sync.spec.ts:123-128` (deliberate 5-line duplication — do NOT refactor the existing spec in this branch).
- Produces: automated proof of the four user-facing behaviors (start on hub, stop in session, toggle music-off keeps cues, master-off kills both).

- [ ] **Step 1: Write the spec**

```ts
// e2e/tests/kid-ambient-music.spec.ts
// Ambient music (audio phase E): instrument AudioContext before the app loads,
// then assert music sources against real navigation. Music = looping
// AudioBufferSource; cues = OscillatorNodes (the discriminator).
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES } from '../helpers/db';

declare global {
  interface Window {
    __audioLog: { music: { started: boolean; stopped: boolean; loop: boolean }[]; oscillators: number };
  }
}

const INSTRUMENT = `
  window.__audioLog = { music: [], oscillators: 0 };
  const wrap = (Ctor) => {
    if (!Ctor) return;
    const origSource = Ctor.prototype.createBufferSource;
    Ctor.prototype.createBufferSource = function () {
      const s = origSource.call(this);
      const entry = { started: false, stopped: false, loop: false };
      window.__audioLog.music.push(entry);
      const oStart = s.start.bind(s), oStop = s.stop.bind(s);
      s.start = (...a) => { entry.started = true; entry.loop = s.loop; return oStart(...a); };
      s.stop = (...a) => { entry.stopped = true; return oStop(...a); };
      return s;
    };
    const origOsc = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function () {
      window.__audioLog.oscillators++;
      return origOsc.call(this);
    };
  };
  wrap(window.AudioContext); wrap(window.webkitAudioContext);
`;

const musicLog = (page: Page) => page.evaluate(() => window.__audioLog.music);
const liveMusic = async (page: Page) =>
  (await musicLog(page)).filter((m) => m.started && m.loop && !m.stopped).length;
const oscCount = (page: Page) => page.evaluate(() => window.__audioLog.oscillators);

async function loginToHub(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('Adresse e-mail').fill(FIXTURES.parentEmail);
  await page.getByPlaceholder('Mot de passe').fill(FIXTURES.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('button', { name: /Plus tard/ }).click();
  await page.getByRole('button', { name: FIXTURES.childName }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(INSTRUMENT);
});

test('ambient music starts on hub, stops in a session, resumes after', async ({ page }) => {
  await loginToHub(page);
  // Autoplay policy: the AudioContext may still be suspended when the hub
  // evaluates its zone; the engine arms a one-shot gesture retry. This tap is
  // that gesture (decode is async afterwards — poll).
  await page.locator('body').click();
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBeGreaterThan(0);

  // Enter a translation session (same path the audio-QA driver used).
  await page.getByText('Traduction').first().click();
  await page.getByText('Niveau 1').first().click();
  await page.getByText(/Leçon 1|Commencer/).first().click();
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBe(0);

  // Back out to ambient territory — music must return.
  await page.goBack();
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('music switch silences ambience but keeps cues; master kills both', async ({ page }) => {
  await loginToHub(page);
  await page.locator('body').click(); // autoplay-unlock gesture (see first test)
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBeGreaterThan(0);

  // Settings → music OFF: loop stops, but a nav cue (oscillator) still fires.
  await page.getByRole('button', { name: /Paramètres|gear|settings/i }).or(page.locator('[aria-label*="aramètres"]')).first().click();
  await page.getByRole('button', { name: /Activée|Coupée/ }).click();
  await expect.poll(() => liveMusic(page), { timeout: 10_000 }).toBe(0);
  const oscBefore = await oscCount(page);
  await page.getByRole('button', { name: /Apprendre|Learn/ }).first().click(); // BottomNav blip
  await expect.poll(() => oscCount(page), { timeout: 10_000 }).toBeGreaterThan(oscBefore);
  await expect.poll(() => liveMusic(page)).toBe(0);
});
```

**Selector caveat (resolve while implementing):** the Settings entry point and BottomNav accessible names must be taken from the real DOM (Chrome/BottomNav components) — adjust the two `getByRole` locators above to the actual labels (e.g. the gear icon's `aria-label`, the nav tab text `Apprendre`). Do not weaken the assertions themselves.

- [ ] **Step 2: Run locally (or via CI)**

Local run needs the test DB + servers with test-DB env:

```bash
createdb gabee_test 2>/dev/null || true
# web on :3000 against gabee_test (reuseExistingServer picks it up):
DATABASE_URL=postgresql://localhost:5432/gabee_test DIRECT_URL=postgresql://localhost:5432/gabee_test AUTH_JWT_SECRET=e2e-only-jwt-secret-not-for-production pnpm --filter @gabee/web dev &
pnpm --filter @gabee/kid dev &   # :5173 (preview build is CI-only on this machine)
cd e2e && pnpm test -- kid-ambient-music.spec.ts
```

Expected: 2 passed. **If the local web/kid server juggling proves flaky, the authoritative gate is the CI e2e job on the PR** — say so in the task report rather than weakening the spec.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/kid-ambient-music.spec.ts
git commit -m "test(e2e/kid): ambient music — hub start, session silence, toggle semantics"
```

---

### Task 10: Full gates + manual QA checklist

**Files:** none (verification gate).

- [ ] **Step 1: Run everything**

```bash
pnpm --filter @gabee/types test && pnpm --filter @gabee/web typecheck && pnpm --filter @gabee/web test \
  && pnpm --filter @gabee/kid test && pnpm --filter @gabee/kid test:dom \
  && pnpm --filter @gabee/kid typecheck && pnpm --filter @gabee/kid lint
```

Expected: all green (lint: 0 errors; the 15 pre-existing warnings are accepted).

- [ ] **Step 2: Manual QA (Valentine, dev server):** loop seam inaudible? volume comfortable vs cues? fade feel on hub→session→hub? Settings switches behave (music off keeps cues; master off kills all; states survive reload + profile switch)? Placeholder tone acceptable until the Suno asset lands?
- [ ] **Step 3: Swap-in point for the real asset (when generated):** drop `ambient-hub.m4a` into `apps/kid/public/music/`, change `MUSIC_URL` in `apps/kid/src/lib/audio/music.ts` to `'/music/ambient-hub.m4a'`, delete the `.wav`, re-run Task 10 Step 1 + listen.
