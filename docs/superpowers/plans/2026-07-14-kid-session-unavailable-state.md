# Kid session load-states — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the infinite loading skeleton in all 9 kid session screens with a nice animated-mascot loader, and — only on a real bundle-load failure — a friendly error state (check connection · Réessayer · Signaler).

**Architecture:** Two shared presentational components (`SessionLoader`, `SessionError`) render the existing `session-screen` shell (`Chrome` bar + the real `Bee` mascot). A tiny pure helper decides error-vs-loading from the query flags. Each screen destructures `isError`/`refetch` from its `useQuery(['bundle', module])` and swaps its one skeleton guard for an error branch + a loader branch.

**Tech Stack:** apps/kid — Vite + React + TanStack Query + react-i18next + `@sentry/react`; tests via `node --import tsx --test` + jsdom/Testing Library (already set up).

## Global Constraints

- Work on branch `fix/kid-session-unavailable-state` (worktree `/Users/valentine/dev/gabee-uxfix`). Do NOT work on other branches.
- **Never render a "no content" / empty message.** Loading, per-question setup, AND the rare empty-pool case all show the animated **loader**. Only a real load *error* shows the error state.
- **Loader = the real `Bee` mascot** (`<Bee bob wings … />`) — never a hand-drawn copy. Error = `<Bee expression="encourage" … />`.
- **Report = Sentry** — `Sentry.captureException(...)` with `{ module, level, lesson }`; no new backend, no new dependency.
- Bilingual FR/EN, kid-friendly copy. Reuse `Chrome` (back/home always work) and `Bee`. No change to the bundle-fetch/cache/offline layer.
- Node@20 keg-only: if `pnpm`/`tsx` not found, prepend `/opt/homebrew/opt/node@20/bin` to PATH.
- No `Co-Authored-By` / Claude attribution trailer in commits.

---

### Task 1: `bundleLoad` helper (error-vs-loading decision) + test

**Files:**
- Create: `apps/kid/src/lib/bundleLoad.ts`
- Test: `apps/kid/src/lib/bundleLoad.test.ts`
- Modify: `apps/kid/package.json` (add the new test file to the `test` script)

**Interfaces:**
- Produces:
  - `isOffline(): boolean` — `true` only when the browser reports offline.
  - `bundleLoadFailed(p: { isLoading: boolean; isError: boolean; hasBundle: boolean; offline: boolean }): boolean` — `true` when the query errored, OR it settled with no bundle while offline (the offline-first "stuck" case). Used by every session screen to pick the error branch.

- [ ] **Step 1: Add the test file to the pure-logic `test` script**

In `apps/kid/package.json`, extend the existing `"test"` script's file list with `src/lib/bundleLoad.test.ts` (append it after the last existing test path, keeping the same `node --import tsx --test …` form).

- [ ] **Step 2: Write the failing test**

Create `apps/kid/src/lib/bundleLoad.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bundleLoadFailed } from './bundleLoad';

const base = { isLoading: false, isError: false, hasBundle: false, offline: false };

describe('bundleLoadFailed', () => {
  it('is true on a query error', () => {
    assert.equal(bundleLoadFailed({ ...base, isError: true }), true);
  });
  it('is true when settled with no bundle while offline (stuck)', () => {
    assert.equal(bundleLoadFailed({ ...base, isLoading: false, hasBundle: false, offline: true }), true);
  });
  it('is false while still loading', () => {
    assert.equal(bundleLoadFailed({ ...base, isLoading: true, offline: true }), false);
  });
  it('is false when a bundle is present (even offline)', () => {
    assert.equal(bundleLoadFailed({ ...base, hasBundle: true, offline: true }), false);
  });
  it('is false when online with no bundle yet (still resolving)', () => {
    assert.equal(bundleLoadFailed({ ...base, hasBundle: false, offline: false }), false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/kid && node --import tsx --test src/lib/bundleLoad.test.ts`
Expected: FAIL — cannot find module `./bundleLoad`.

- [ ] **Step 4: Implement the helper**

Create `apps/kid/src/lib/bundleLoad.ts`:

```ts
/**
 * Shared loading/error decision for the 9 kid session screens. The bundle query
 * (`useQuery(['bundle', module])`) can (a) error — offline before it's cached,
 * unpaired → 401, network fail — or (b) settle "paused" with no data while
 * offline (networkMode: 'offlineFirst'). Both mean the kid should see the
 * friendly error state, not an endless loader.
 */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function bundleLoadFailed(p: {
  isLoading: boolean;
  isError: boolean;
  hasBundle: boolean;
  offline: boolean;
}): boolean {
  if (p.isError) return true;
  // Settled (not loading) with no bundle AND offline → stuck; show the error.
  return !p.isLoading && !p.hasBundle && p.offline;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/kid && node --import tsx --test src/lib/bundleLoad.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/kid/src/lib/bundleLoad.ts apps/kid/src/lib/bundleLoad.test.ts apps/kid/package.json
git commit -m "feat(kid): bundleLoad helper — error-vs-loading decision for session screens"
```

---

### Task 2: `SessionLoader` + `SessionError` components + i18n

**Files:**
- Create: `apps/kid/src/components/SessionLoader.tsx`, `apps/kid/src/components/SessionError.tsx`
- Modify: `apps/kid/src/i18n.ts` (add a `session` namespace under `fr` and `en`)

**Interfaces:**
- Consumes: `Chrome` (`apps/kid/src/components/Chrome.tsx`), `Bee` (`apps/kid/src/components/Bee.tsx`), `Sentry` (`apps/kid/src/lib/sentry.ts`), `useTranslation` (react-i18next).
- Produces (both take the same shell props the screens already pass to `Chrome`, plus `module`):
  ```ts
  type ChromeProps = React.ComponentProps<typeof Chrome>;
  interface SessionShellProps {
    module: string;                 // m.id → data-module (session-screen accent)
    title: string;                  // m.label[lang]
    lang: ChromeProps['lang'];
    setLang: ChromeProps['setLang'];
    onBack: () => void;
    onHome: () => void;
    profile: ChromeProps['profile'];
  }
  ```
  - `SessionLoader(props: SessionShellProps)`
  - `SessionError(props: SessionShellProps & { onRetry: () => void; level?: number; lesson?: number })`

- [ ] **Step 1: Add the `session` i18n keys (FR + EN)**

In `apps/kid/src/i18n.ts`, add a `session` object inside the `fr` `translation` block:

```ts
      session: {
        errorTitle: 'Oups !',
        errorBody: "Le contenu n'a pas pu charger. Vérifie ta connexion internet.",
        retry: 'Réessayer',
        persist: 'Si ça continue :',
        report: 'Signaler le problème',
        reportThanks: 'Merci, on regarde 💛',
      },
```

and the matching block inside the `en` `translation` block:

```ts
      session: {
        errorTitle: 'Oops!',
        errorBody: "The content couldn't load. Check your internet connection.",
        retry: 'Try again',
        persist: 'If it keeps happening:',
        report: 'Report the problem',
        reportThanks: "Thanks, we're on it 💛",
      },
```

(Match the file's existing nested-object shape, next to the `code`/`pair`/etc. namespaces.)

- [ ] **Step 2: Create `SessionLoader.tsx`**

```tsx
import { Bee } from './Bee';
import { Chrome } from './Chrome';

type ChromeProps = React.ComponentProps<typeof Chrome>;

export interface SessionShellProps {
  module: string;
  title: string;
  lang: ChromeProps['lang'];
  setLang: ChromeProps['setLang'];
  onBack: () => void;
  onHome: () => void;
  profile: ChromeProps['profile'];
}

/**
 * Loading state for every session screen — the real Bee mascot with its gentle
 * `bob` float. Shown while the bundle loads, during per-question setup, and for
 * the rare empty-pool case. Deliberately no "no content" text.
 */
export function SessionLoader({ module, title, lang, setLang, onBack, onHome, profile }: SessionShellProps) {
  return (
    <div className="session-screen" data-module={module}>
      <Chrome lang={lang} setLang={setLang} title={title} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="session-body session-loading" aria-busy="true" aria-live="polite">
        <Bee size={112} expression="idle" wings bob />
        <div className="session-loading-dots" aria-hidden="true"><span /><span /><span /></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `SessionError.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bee } from './Bee';
import { Chrome } from './Chrome';
import { Sentry } from '../lib/sentry';
import type { SessionShellProps } from './SessionLoader';

/**
 * Error state — shown ONLY when the bundle genuinely failed to load. Friendly
 * kid copy + Réessayer (refetch) + a secondary "Signaler le problème" that fires
 * a Sentry report and confirms. Back/Home stay available via the Chrome bar.
 */
export function SessionError({
  module, title, lang, setLang, onBack, onHome, profile, onRetry, level, lesson,
}: SessionShellProps & { onRetry: () => void; level?: number; lesson?: number }) {
  const { t } = useTranslation();
  const [reported, setReported] = useState(false);

  function report() {
    if (reported) return;
    Sentry.captureException(new Error('kid session bundle load failed'), {
      extra: { module, level, lesson },
    });
    setReported(true);
  }

  return (
    <div className="session-screen" data-module={module}>
      <Chrome lang={lang} setLang={setLang} title={title} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="session-body session-error" role="alert">
        <Bee size={92} expression="encourage" wings />
        <h2 className="session-error-title">{t('session.errorTitle')}</h2>
        <p className="session-error-body">{t('session.errorBody')}</p>
        <div className="session-error-actions">
          <button className="btn mint" onClick={onRetry}>↻ {t('session.retry')}</button>
          <p className="session-error-persist">{t('session.persist')}</p>
          <button
            className={'btn ghost' + (reported ? ' done' : '')}
            onClick={report}
            disabled={reported}
            aria-live="polite"
          >
            {reported ? t('session.reportThanks') : t('session.report')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the loader/error styles**

Append to `apps/kid/src/index.css` (reuse existing `.session-body` layout; add centering + the loader dots + error text):

```css
.session-loading,
.session-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 260px;
  text-align: center;
}
.session-loading-dots { display: flex; gap: 9px; }
.session-loading-dots span {
  width: 9px; height: 9px; border-radius: 50%;
  background: #F5A623; opacity: .35;
  animation: session-dot 1.2s ease-in-out infinite;
}
.session-loading-dots span:nth-child(2) { animation-delay: .18s; }
.session-loading-dots span:nth-child(3) { animation-delay: .36s; }
@keyframes session-dot { 0%,100% { opacity: .3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-4px); } }
.session-error-title { font-size: 1.5rem; font-weight: 800; margin: 4px 0 0; }
.session-error-body { color: var(--text-2, #6B6455); max-width: 28ch; margin: 0; line-height: 1.4; }
.session-error-actions { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 240px; margin-top: 4px; }
.session-error-persist { font-size: .8rem; color: var(--text-2, #6B6455); margin: 6px 0 -2px; opacity: .85; }
.btn.ghost.done { color: var(--mint-deep, #15803d); cursor: default; }
@media (prefers-reduced-motion: reduce) { .session-loading-dots span { animation: none; } }
```
(If `--text-2`/`--mint-deep` aren't defined in the kid CSS, the fallbacks apply; check the file's existing tokens and use them if present.)

- [ ] **Step 5: Typecheck**

Run: `cd apps/kid && pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/kid/src/components/SessionLoader.tsx apps/kid/src/components/SessionError.tsx apps/kid/src/i18n.ts apps/kid/src/index.css
git commit -m "feat(kid): SessionLoader + SessionError components (animated mascot + retry/report)"
```

---

### Task 3: Wire the two states into all 9 session screens

**Files (all Modify):** `apps/kid/src/screens/{CodeTurtleSession,KeyboardScrollingSession,KeyboardStaticSession,NumbersSession,TranslationSession,WordsBuildSession,WordsFillSession,WordsPictureSession,WordsReadSession}.tsx`

**Interfaces:**
- Consumes: `SessionLoader`, `SessionError` (Task 2), `bundleLoadFailed`/`isOffline` (Task 1).

Each screen gets the **same three edits**. The only per-screen variation is the trailing readiness checks in the existing guard (kept verbatim in the loader branch).

- [ ] **Step 1: Add imports (each of the 9 screens)**

```tsx
import { SessionLoader } from '../components/SessionLoader';
import { SessionError } from '../components/SessionError';
import { bundleLoadFailed, isOffline } from '../lib/bundleLoad';
```

- [ ] **Step 2: Extend the query destructure (each screen)**

Change `const { data: bundle, isLoading } = useQuery({...})` to:
```tsx
const { data: bundle, isLoading, isError, refetch } = useQuery({...});
```

- [ ] **Step 3: Replace the single skeleton guard with an error branch + loader branch (each screen)**

Each screen has exactly one block of the form:
```tsx
if (isLoading || !session || !q /* …screen-specific… */) {
  return (
    <div className="session-screen" data-module="X">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="session-body"><div className="skeleton" style={{ height: 220 }} /></div>
    </div>
  );
}
```
Replace it with:
```tsx
const shell = { module: m.id, title: m.label[lang], lang, setLang, onBack, onHome, profile };
if (bundleLoadFailed({ isLoading, isError, hasBundle: !!bundle, offline: isOffline() })) {
  return <SessionError {...shell} onRetry={() => void refetch()} level={level} lesson={lesson} />;
}
if (isLoading || !session || !q /* …keep this screen's exact trailing checks… */) {
  return <SessionLoader {...shell} />;
}
```

Per-screen trailing checks to preserve in the loader branch (copy exactly from the current guard):
- `CodeTurtleSession.tsx` (L348): `!session || !q || !puzzle || !cur`
- `KeyboardScrollingSession.tsx` (L349): `!session || !q`
- `KeyboardStaticSession.tsx` (L379): `!session || !q`
- `NumbersSession.tsx` (L269): `!session || !q`
- `TranslationSession.tsx` (L286): `!session || !q || !dir`
- `WordsBuildSession.tsx` (L326): `!session || !q`
- `WordsFillSession.tsx` (L249): `!session || !q || !promptParts`
- `WordsPictureSession.tsx` (L235): `!session || !q`
- `WordsReadSession.tsx` (L273): `!session || !q`

Notes: every screen already has `m`, `lang`, `setLang`, `onBack`, `onHome`, `profile`, `level`, `lesson` in scope (they're props/derived). `m.id` is the module id used by `data-module`. Delete the now-unused inline skeleton markup + its `<Chrome>` (the components render their own shell). Leave the `isLoading || !session …` string intact inside the loader branch.

- [ ] **Step 4: Typecheck**

Run: `cd apps/kid && pnpm typecheck`
Expected: no errors (watch for any screen where `level`/`lesson` is named differently — pass the correct in-scope vars; if a screen lacks `lesson`, omit that prop).

- [ ] **Step 5: Lint**

Run: `cd apps/kid && pnpm lint`
Expected: no new errors (removed skeleton markup shouldn't leave unused imports — if a screen no longer uses `Chrome` directly, remove its `Chrome` import).

- [ ] **Step 6: Commit**

```bash
git add apps/kid/src/screens/*Session.tsx
git commit -m "feat(kid): wire SessionLoader/SessionError into all 9 session screens"
```

---

### Task 4: Component test (jsdom) for the error/retry/report + loader flow

**Files:**
- Create: `apps/kid/src/screens/NumbersSession.states.test.tsx` (Numbers is the simplest guard: `!session || !q`)
- Modify: `apps/kid/package.json` (`test:dom` runs the new file too)

**Interfaces:**
- Consumes: the jsdom harness (`src/test/setup-dom.ts`), Testing Library, the patchable `api` singleton + `useStore` (same pattern as `CodeTurtleSession.guide.test.tsx`).

- [ ] **Step 1: Point `test:dom` at both component tests**

In `apps/kid/package.json`, change the `test:dom` script so it runs both `src/screens/CodeTurtleSession.guide.test.tsx` and `src/screens/NumbersSession.states.test.tsx` (same `node --import tsx --test --test-force-exit …` form, two file args).

- [ ] **Step 2: Write the test**

Create `apps/kid/src/screens/NumbersSession.states.test.tsx` (mirror the setup of `CodeTurtleSession.guide.test.tsx` — import `../test/setup-dom` FIRST, `QueryClientProvider`, patch `api.getBundle`, seed `useStore`, mock `Sentry`):

```tsx
import '../test/setup-dom';
import { createElement } from 'react';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { api } from '../lib/api';
import { useStore } from '../store';
import * as sentry from '../lib/sentry';
import { NumbersSession } from './NumbersSession';

function seed() {
  useStore.setState({
    lang: 'fr',
    profile: { id: 'kid-1', name: 'Test', birth_date: null } as never,
    play: { id: 'p1' } as never,
  });
}
function renderSession() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client },
      createElement(NumbersSession, {
        level: 1, lesson: 1, isRevision: false, trigger: 'new',
        onDone: () => {}, onHome: () => {}, onBack: () => {},
      } as never)),
  );
}

beforeEach(() => { localStorage.clear(); seed(); });
afterEach(() => cleanup());

describe('NumbersSession load states', () => {
  it('shows the error state (not an endless loader) when the bundle fails, and retry refetches', async () => {
    let calls = 0;
    api.getBundle = async () => { calls++; throw new Error('boom'); };
    renderSession();
    // Error copy appears (FR), with Réessayer + Signaler.
    await screen.findByText(/Oups/i);
    assert.ok(screen.getByRole('button', { name: /Réessayer/i }));
    const before = calls;
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/i }));
    await waitFor(() => assert.ok(calls > before)); // refetch fired
  });

  it('report fires Sentry once and confirms', async () => {
    api.getBundle = async () => { throw new Error('boom'); };
    let captured = 0;
    (sentry.Sentry as unknown as { captureException: (...a: unknown[]) => void }).captureException = () => { captured++; };
    renderSession();
    const report = await screen.findByRole('button', { name: /Signaler le problème/i });
    fireEvent.click(report);
    await screen.findByText(/Merci, on regarde/i);
    assert.equal(captured, 1);
    fireEvent.click(report); // idempotent
    assert.equal(captured, 1);
  });
});
```

- [ ] **Step 3: Run the DOM test**

Run: `cd apps/kid && pnpm test:dom`
Expected: the guide test still passes AND both new tests pass. If `NumbersSession`'s prop names differ from the guessed shape, fix the render props to match the real component signature (read `NumbersSession.tsx`'s props) and re-run until green.

- [ ] **Step 4: Full checks**

Run: `cd apps/kid && pnpm test && pnpm typecheck`
Expected: pure suite + typecheck clean.

- [ ] **Step 5: Manual QA note**

Run `pnpm dev`; open a submodule with the network throttled to offline (DevTools) → the animated Bee loader, then (once the query errors) the friendly error with working **Réessayer**/**Signaler**/**Retour**, never a dead skeleton. (Manual — not a coded step.)

- [ ] **Step 6: Commit**

```bash
git add apps/kid/src/screens/NumbersSession.states.test.tsx apps/kid/package.json
git commit -m "test(kid): component test for session error/retry/report + loader"
```

---

## Self-Review

**Spec coverage:**
- Animated-mascot loader (no "no content" text) → Task 2 `SessionLoader` (real `Bee` + `bob`) + Task 3 wiring. ✅
- Error-only state (connection + Réessayer + Signaler → Sentry, back via Chrome) → Task 2 `SessionError`. ✅
- Applied to all 9 screens → Task 3. ✅
- Offline-stuck detection → Task 1 `bundleLoadFailed`/`isOffline`. ✅
- i18n FR/EN → Task 2 Step 1. ✅
- Tests: pure `bundleLoadFailed` (Task 1) + component error/retry/report + loader (Task 4). ✅

**Placeholder scan:** none. Every step has concrete code/commands. The per-screen trailing-check list is explicit.

**Type consistency:** `SessionShellProps` (module/title/lang/setLang/onBack/onHome/profile) is defined in Task 2 and consumed identically in Task 3's `shell` object; `SessionError` adds `onRetry`/`level`/`lesson`. `bundleLoadFailed`'s param shape matches its Task-1 definition. `Bee` props (`size/expression/wings/bob`) match the real component; `Chrome` props match the existing call sites.

**Known implementer checks (flagged inline):** confirm each screen's in-scope var names for `level`/`lesson` (omit `lesson` where absent); remove now-unused `Chrome` imports per screen; verify `NumbersSession`'s real prop signature in the Task-4 test; use the kid CSS's actual color tokens if `--text-2`/`--mint-deep` differ.
