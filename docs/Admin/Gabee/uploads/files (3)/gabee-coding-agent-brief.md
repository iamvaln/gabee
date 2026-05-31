# Gabee — Coding Agent Brief (Phase 1)

> Paste this as the initial context for a coding agent. It's self-contained; the full spec (`product-spec-v0.1.md`) is the source of truth for any detail not here.

## What we're building

**Gabee** is a bilingual (FR/EN), desktop-first, gamified **learning tool** for children ~6-8. It is offline-capable and syncs when online. Phase 1's purpose is not a polished product — it is to make children play *and* to capture enough data to answer one question: **do they adhere (come back, engage, learn)?** Measurement is the point. Treat the event pipeline as first-class, not an afterthought.

## Stack & layout (monorepo)

pnpm workspaces + Turborepo. **TypeScript end-to-end.**

```
gabee/
├── apps/web/        # Next.js (App Router): (marketing) landing + (parent) + (admin) + app/api/* — this IS the backend
├── apps/kid/        # Vite + React PWA — offline; the only app children touch; calls api.gabee.app
├── packages/types/  # shared: event schema, question shape, Zod API contracts, enums
└── packages/db/     # Prisma schema + migrations + seed scripts
```

Stack: **one Next.js app (App Router)** = landing + parent + admin + **API route handlers** — **no separate backend** · **Zod** (shared contracts) · **Prisma + Supabase Postgres** · **Supabase Auth** via `@supabase/ssr` (email/password) · **Claude API** (provider-abstracted) · web i18n **next-intl** · **Recharts** (charts) · **TanStack Table** (admin) · kid app **React + Vite + Tailwind PWA** — **Zustand** (local) + **TanStack Query** (server/sync) · **Dexie** (IndexedDB) · **vite-plugin-pwa** (Workbox under the hood) · **Motion** (`motion/react`) · **Howler.js** · **i18next** · **Mailgun** (email).

Kid app calls `api.gabee.app` via **CORS + the parent's Supabase JWT**. Domains: one registrable domain **`gabee.app`** (wildcard SSL) — `gabee.app` (landing) · `parents.` · `admin.` · `api.` (Next) · `kids.` (kid PWA). Hosting: preprod **Vercel** (Next + kid static); production a **VPS** (Next `output: 'standalone'` container behind nginx; kid app static). All four Next subdomains are the **same `apps/web` deployment**, routed by **`Host`-based middleware**: `api.` exposes only `/api/*` (+ CORS for `kids.`), `admin.` → `(admin)` behind an admin-session gate, `parents.` → `(parent)`, apex → `(marketing)`. Only the kid app is cross-origin; parent/admin call same-origin routes (no CORS).

## Phase 1 scope

**In:**
- Kid app: 5 modules (Numbers, Words, Keyboard, Code, Translation), **3 levels each**, 4 fixed avatars (a profile = the child's **real name** + an avatar; **no character-naming** — the in-app character, including the Code protagonist, is **Gabee**), FR + EN, offline + sync.
- Web app (Next, `apps/web`): **API route handlers** for auth, profiles, versioned question bundles, event ingestion, progress sync, classification queue, daily email digest, data-view aggregates; plus a minimal `(marketing)` landing and the `(parent)` route group.
- Account model: 1 parent account, up to 3 child profiles (no child login).
- **Full event tracking**, including the process-rich typing / coding / sentence-build events.
- Parent surface: `(parent)` route group — session classification + minimal per-child data view.
- ~60 seeded questions per module (FR + EN), inserted directly via seed scripts.

**Out (do NOT build):** the `(admin)` route group + authoring UI, AI generation pipeline, full parent dashboard, voiceover, avatar recoloring, badges/streaks, levels 4-10. These are Phase 2/3.

## Key contracts (build `packages/types` first)

- **Events** (full definitions in spec §9.2, §9.3, §9.5). The non-obvious, must-have ones:
  - `lesson_started` { trigger: 'new'|'retry'|'replay', position_in_session } — powers the adherence/volition read; do not skip the trigger field.
  - `typing_keystroke`, `typing_word_completed` — per-keystroke detail (expected vs typed char, timing, backspace).
  - `code_run`, `code_level_solved` — blocks_used vs optimal_blocks, attempts, wall_hits, loop/conditional usage.
  - `sentence_build` — placements/removals, first_try_success, wrong_positions.
  - `question_answered` carries `selected_option`; reading `question_shown` carries `passage_dwell_ms`.
  - `session_start` carries `initiation_label` (null until the parent classifies).
  - Parent-side: `classification_nudge_sent`, `nudge_opened`, `classification_made` (with latency).
- **Question record**: language-dependent text fields are `{ fr, en }` pairs; language-agnostic (bare arithmetic) leaves `lang: null`. See spec §5 and Appendix B.4.
- **Data model**: `ParentAccount`, `ChildProfile`, `Question`, `Event`, `SessionClassification`, `ContentBundleVersion`. See spec §7.3.
- **API contracts are Zod schemas** in `packages/types`; the Next route handlers parse/validate every request and response with them, and the kid app imports the same schemas — never redefine a shape locally.

## Build order (milestones)

1. **Repo + `packages/types` + `packages/db`** — contracts and schema first; everything depends on them.
2. **Web app + API core** — Next.js (App Router); API as **Route Handlers** in `app/api/*` with a `lib/server/*` services layer and **Zod** at every boundary; Supabase Auth via `@supabase/ssr`; profiles; Postgres via Prisma + migrations; **CORS for the `kids.` origin + bearer-JWT** on kid-facing endpoints.
3. **Seed content** — ~60 q/module, bilingual, distractors `error_type`-tagged where applicable.
4. **Kid app shell** — onboarding, hub, one module end-to-end (start with **Numbers**, the vertical slice **L1 numbers-to-20 · L4 add-within-20 · L7 subtract-within-100**) including its events.
5. **Sync engine** — IndexedDB queue → batch event ingestion → verify events land in Postgres end-to-end.
6. **Remaining 4 modules**, including the process-rich events for Keyboard, Code, Words/build-sentence.
7. **Offline + service worker** — full session with no network; no event loss across reconnect.
8. **Parent surface** — `(parent)` route group (classification queue + minimal data view) + a minimal `(marketing)` landing; wire the email digest.
9. **Guardrails + polish** — healthy-use limits, completion celebration, FR/EN toggle.

## Conventions

- **Always consult the official documentation** for every library and service before using its APIs. Do not rely on memory or assumptions about API shapes, config, or versions; verify against current docs, and prefer the patterns the docs recommend. If an API has changed, follow the docs, not this brief. **Canonical links are in the "Official documentation" section below.**
- Strict TypeScript; share all cross-app types from `packages/types` — never redefine an event or contract locally.
- No secrets in code; `.env` only, with a committed `.env.example`.
- Every kid-facing string is FR/EN; never hardcode one language.
- A language-dependent question with a missing language must fail seeding/validation, not ship half-translated.
- Offline-first: assume intermittent connectivity; the kid app must never block on the network.
- **No separate backend** — the API lives in `apps/web` route handlers. Keep a `lib/server/*` services layer and Zod validation at every boundary so handlers don't sprawl. Use Server Actions only for the web app's *own* parent/admin mutations, never as the kid app's API (it's cross-origin).

## Official documentation (verified — consult before using each)

Versions and APIs drift; verify against these before coding. Two gotchas for this project:
- **Server Actions vs Route Handlers** — the kid PWA is a *separate origin*, so its API must be **Route Handlers** (REST). Server Actions can't be called cleanly cross-origin; use them only for the web app's own parent/admin mutations.
- **"Framer Motion" is now "Motion"** — install `motion`, import from `motion/react` (not `framer-motion`).

| Area | Tool | Docs |
|---|---|---|
| Language | TypeScript | https://www.typescriptlang.org/docs |
| Monorepo | pnpm | https://pnpm.io |
| | Turborepo | https://turborepo.dev/docs |
| Web framework + API | Next.js (App Router) | https://nextjs.org/docs |
| Validation | Zod | https://zod.dev |
| | Prisma | https://www.prisma.io/docs |
| DB + Auth | Supabase | https://supabase.com/docs |
| LLM | Claude API | https://docs.claude.com |
| Frontend | React | https://react.dev |
| | Vite | https://vite.dev |
| | Tailwind CSS | https://tailwindcss.com/docs |
| State | Zustand | https://github.com/pmndrs/zustand |
| | TanStack Query (React Query) | https://tanstack.com/query/latest |
| Tables (admin) | TanStack Table | https://tanstack.com/table/latest |
| Offline storage | Dexie | https://dexie.org/docs |
| Service worker / PWA | **vite-plugin-pwa** (primary) | https://vite-pwa-org.netlify.app |
| | Workbox (engine, used by the plugin) | https://developer.chrome.com/docs/workbox |
| Animation | Motion (ex–Framer Motion) | https://motion.dev/docs/react |
| Audio (voiceover) | Howler.js | https://github.com/goldfire/howler.js |
| i18n (web) | next-intl | https://next-intl.dev |
| i18n (kid) | i18next | https://www.i18next.com |
| | react-i18next | https://react.i18next.com |
| Charts (parent) | Recharts | https://recharts.org |
| Email | Mailgun | https://documentation.mailgun.com |
| Hosting (preprod) | Vercel (Next app + kid static) | https://vercel.com/docs |

---

## Guardrails (product intent — respect these)

- This is a **learning tool, not an attention casino.** Do not add engagement-maximizing dark patterns: no streak-guilt, no FOMO, no nagging. Honor the healthy-use limits (daily cap, ~20 min soft limit, look-away breaks).
- The email digest is **one per day, timing-optimized, not frequency-maximized.** Do not build escalating reminders.
- Keep the Phase 1 data view **minimal** — it must show the truth, not be pretty. Resist turning it into the Phase 2 dashboard.
- Gamification is **content-neutral** (stars, progress, avatars) — no themed fictional world.

## First task

Initialize the monorepo (pnpm + Turborepo), scaffold the workspaces (`apps/web`, `apps/kid`, `packages/types`, `packages/db`), and implement `packages/types` with the full event schema, question-record types, and **Zod API contracts** from the spec. Stop and show the proposed type definitions for review before building the Next app + route handlers on top of them.
