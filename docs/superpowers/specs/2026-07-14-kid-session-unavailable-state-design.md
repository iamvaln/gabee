# Kid-app session load states — design

**Date:** 2026-07-14
**Branch:** `fix/kid-session-unavailable-state`
**Status:** approved design → implementation plan next

## Problem
Every kid session screen fetches its content bundle with
`useQuery(['bundle', module])` and destructures only `{ data: bundle, isLoading }`.
The render guard is `if (isLoading || !session || !q || !puzzle || !cur) return <skeleton/>`.
When the bundle **fails to load** (offline before it's cached, unpaired → 401, network
error) or the level pool is **empty**, `isLoading` goes false but `session` stays
`null`, so the guard renders a **bare skeleton forever** — no message, no retry, no way
forward. The kid taps a submodule and nothing responds ("dead tap"). This affects prod
too: a kid offline before the bundle is cached hits the same dead screen. All **9**
`*Session.tsx` screens share this exact pattern.

## Goal
Replace the dead skeleton with two clear states, applied consistently across all 9
session screens:
1. A **nice animated loader** for the normal loading/setup path (and the rare
   empty-pool edge) — never any "no content" text.
2. On an **actual load error only**, a friendly kid-facing state: check your
   connection, **Réessayer** (retry), and **report the bug** if it persists.

## Decisions (settled in brainstorming)
- **No "no content" / empty message, ever.** Empty/loading both show the animated
  loader.
- **Error state only on real failure**, with three actions: **Réessayer** (refetch),
  **Signaler le problème** (report), and **Retour**/**Accueil** (via the shared
  `Chrome` bar).
- **Report = Sentry** (`@sentry/react`, already in the kid app) — `captureException`
  with `{ module, level, lesson }` context; no new backend.
- **Loader = the Bee mascot** animating (`Bee` with `wings`/`bob`) — branded,
  kid-friendly; reuse, no new deps.
- Applies to all 9 session screens via shared components.

## Non-goals
- No change to the bundle-fetch/caching/offline layer (`lib/api`, Dexie, sync).
- No new report/feedback backend (Sentry captures the diagnostic).
- No per-module bespoke copy — one shared, generic-but-friendly error message.

## Architecture

### 1. Two shared components — `apps/kid/src/components/`
- **`SessionLoader.tsx`** — `SessionLoader({ module, onBack, onHome })`. Renders the
  standard `session-screen` shell (`Chrome` top bar + `data-module`) with a centered
  **animated Bee** (`<Bee wings bob expression="idle" />`) and a soft looping motion,
  replacing `<div className="skeleton">`. Purely presentational. Shown for loading,
  per-question setup, and the rare empty-pool case.
- **`SessionError.tsx`** — `SessionError({ module, onRetry, onBack, onHome })`. Same
  `session-screen` shell (so back/home always work), a sad-but-friendly Bee
  (`expression="encourage"`), the error copy, and two buttons: **Réessayer**
  (`onRetry`) and, secondary, **Signaler le problème**. The report button calls
  `Sentry.captureException(new Error('kid session bundle load failed'), { extra: { module, level, lesson } })`,
  then swaps its label to the thank-you (`Merci, on regarde 💛`) and disables itself.
  Framed with "si ça continue" so report is the escalation, retry is primary.

### 2. Per-screen wiring — all 9 `*Session.tsx`
Minimal, uniform edit in each screen:
- Extend the query destructure: `const { data: bundle, isLoading, isError, refetch } = useQuery({...})`.
- Compute a `loadFailed` flag that also catches the offline-first "stuck" case:
  `const loadFailed = isError || (!isLoading && !bundle && !navigatorOnline())`
  (a tiny `navigatorOnline()` helper = `typeof navigator !== 'undefined' && navigator.onLine === false ? false : true`; offline + no cached bundle → treat as error so the kid gets the connection message + retry instead of an endless loader).
- Replace the single skeleton guard with:
  ```tsx
  if (loadFailed) {
    return <SessionError module={m.id} onRetry={() => void refetch()} onBack={onBack} onHome={onHome} />;
  }
  if (isLoading || !session || !q || /* per-screen: !puzzle/!cur/etc. */) {
    return <SessionLoader module={m.id} onBack={onBack} onHome={onHome} />;
  }
  ```
  Each screen keeps its own extra readiness checks (`!puzzle`, `!cur`, etc.) in the
  loader branch — only the error branch and the loader swap are new.

### 3. Auto-recovery
Keep react-query's `refetchOnReconnect` (default on) so the query auto-retries when the
device comes back online; the manual **Réessayer** covers the "retry now" case. No
change to the global `QueryClient` (retry: 1, networkMode: offlineFirst) is required;
the error state simply surfaces the already-failed/paused query.

### 4. i18n — `apps/kid/src/i18n.ts`
Add a `session` namespace (FR + EN), kid-friendly:
- `session.error.title` — FR "Oups !" / EN "Oops!"
- `session.error.body` — FR "Le contenu n'a pas pu charger. Vérifie ta connexion internet." / EN "The content couldn't load. Check your internet connection."
- `session.error.retry` — FR "Réessayer" / EN "Try again"
- `session.error.report` — FR "Signaler le problème" / EN "Report the problem"
- `session.error.reportThanks` — FR "Merci, on regarde 💛" / EN "Thanks, we're on it 💛"
- `session.error.persistHint` — FR "Si ça continue…" / EN "If it keeps happening…"
(No loading text — the loader is animation only.)

## Testing / acceptance
- **Unit (pure logic):** a `loadFailed` helper test — `isError` → true; `!isLoading && !bundle` while offline → true; loading or bundle-present → false. (node:test via tsx, matching the repo pattern.)
- **Component (jsdom + Testing Library, the harness added for the guide):** render a
  session screen with `api.getBundle` mocked to **reject** → asserts `SessionError`
  shows (title + Réessayer + Signaler), tapping **Réessayer** calls `refetch`
  (mock resolves second time → content renders), tapping **Signaler** calls
  `Sentry.captureException` and swaps to the thank-you. Mock resolving-but-empty →
  `SessionLoader` (never an error/"no content").
- **Manual QA (dev + staging):** open a submodule offline / with the API down → the
  animated loader then the friendly error with working Réessayer/Signaler/Retour, not
  a dead skeleton.

## Rollout
1. `SessionLoader` + `SessionError` components + the `session.*` i18n keys +
   `navigatorOnline` helper (+ unit test).
2. Wire the two states into all 9 `*Session.tsx` (uniform edit).
3. Component test (one representative screen) + manual QA offline.

## File inventory
- Create: `apps/kid/src/components/SessionLoader.tsx`,
  `apps/kid/src/components/SessionError.tsx`, a `navigatorOnline` helper (small — e.g.
  `apps/kid/src/lib/online.ts`) + its test, and a component test under
  `apps/kid/src/screens/`.
- Modify: the 9 `apps/kid/src/screens/*Session.tsx` (query destructure + guard swap),
  `apps/kid/src/i18n.ts` (session keys).
