# Gabee — Phase 1 Engineering Checklist

**Goal of Phase 1:** children play, and you can *see* whether they adhere. "Playable + measurable." Everything here serves that; anything that doesn't is Phase 2+.

**Reference:** the full product spec (`product-spec-v0.1.md`). Section numbers below (§) point to it.

---

## 0. Decisions — locked

- ✅ **Monorepo** — pnpm workspaces + Turborepo
- ✅ **Backend language** — TypeScript end-to-end (shared `packages/types`)
- ✅ **Architecture** — one **Next.js (App Router)** app = landing + parent + admin + API route handlers (**no separate backend service**); kid app = **Vite + React PWA**
- ✅ **Validation / i18n** — **Zod** shared contracts · web i18n **next-intl** · kid i18n **i18next**
- ✅ **Hosting** — preprod **Vercel** (Next app + kid PWA static) + Supabase + Mailgun; production a **VPS** (Next `output: 'standalone'` container behind nginx; kid app served static)
- ✅ **Auth** — Supabase Auth, email + password
- ✅ **Email** — Mailgun (classification digest + transactional)
- ✅ **Curriculum** — our own scope-and-sequence
- ✅ **Avatars** — AI-suggested designs
- ✅ **Monetization** — free
- ✅ **LLM** — Claude behind a provider-abstracted layer; AI usage tracked (Phase 2 generation)
- ✅ **Numbers pilot slice** — vertical slice L1 (numbers to 20) / L4 (add within 20) / L7 (subtract within 100)

---

## 1. Repo & tooling

- [ ] Init monorepo: `pnpm-workspace.yaml`, `turbo.json`, root `package.json`
- [ ] Shared `tsconfig.base.json`, ESLint + Prettier, strict TypeScript
- [ ] `.env` handling + secrets out of git (`.env.example` committed)
- [ ] CI: lint + typecheck + build on PR (GitHub Actions)
- [ ] App scaffolds: `apps/web` (Next.js — `(marketing)` landing + `(parent)` + `(admin)` route groups + `app/api/*`), `apps/kid` (Vite PWA); package scaffolds: `packages/types`, `packages/db`
- [ ] (`(admin)` route group + `packages/ui` deferred to Phase 2 — Phase 1 ships the `(marketing)` landing + `(parent)` + the API only)

## 2. Shared packages

### `packages/types`
- [ ] **Event schema** — every event from §9.2 (typing, code, sentence_build), §9.3 (cross-module), §9.5 (parent-side), as typed interfaces
- [ ] **Question record** shape, incl. bilingual `{ fr, en }` pairs for language-dependent fields (§5, Appendix B.4)
- [ ] **API contracts as Zod schemas** (request/response) for every endpoint — shared by the Next route handlers and the kid app
- [ ] **Enums**: modules, Words sub-modes, lesson trigger (`new`/`retry`/`replay`), initiation label (`child_initiated`/`prompted`/`unsure`), question status

### `packages/db`
- [ ] Prisma schema with: `ParentAccount`, `ChildProfile`, `Question`, `Event`, `SessionClassification`, `ContentBundleVersion`
- [ ] Migrations
- [ ] Seed scripts (used in §6)

## 3. Web app + API (`apps/web`, Next.js App Router)

- [ ] Next.js (App Router) up; **API as Route Handlers** in `app/api/*` (REST/JSON), a `lib/server/*` services layer, **Zod** validation at every boundary; Postgres via Prisma
- [ ] **CORS** on the `api.gabee.app` handlers for the `kids.gabee.app` origin; **bearer-JWT** (the parent's Supabase token) on all kid-facing endpoints
- [ ] **Auth**: Supabase Auth via `@supabase/ssr` (parent signup + login, email + password)
- [ ] **Device auth-once flow** (§7.2): parent authenticates the kid device once, then kid picks a profile (no child login)
- [ ] **Profiles**: CRUD for up to 3 child profiles per account
- [ ] **Question bundles**: versioned fetch per module (§5) — returns confirmed, bilingual questions
- [ ] **Event ingestion**: batch endpoint, validate against `packages/types`, persist
- [ ] **Progress sync**: push/pull progress diffs, last-write-wins per field (§8)
- [ ] **Classification queue**: endpoint to list unclassified sessions per child; endpoint to set a label
- [ ] **Email digest**: batched daily nudge of pending classifications (§13.2); record `classification_nudge_sent`
- [ ] **Data-view aggregates**: compute adherence / engagement / learning / parent-willingness signals (§13.2, §13.4, §9.5)
- [ ] Privacy: all child data scoped to the owning parent account (§9.1)

## 4. Kid app (`apps/kid`)

- [ ] Vite + React + Tailwind PWA scaffold
- [ ] **Service worker** (via **vite-plugin-pwa**, Workbox under the hood): cache assets + question bundles; cache-first content, network-first updates (§8)
- [ ] **IndexedDB** (Dexie): profiles, progress, queued events
- [ ] **Onboarding**: parent auth-once → child picks their profile + avatar; the child's **real name** is set by the parent (no character-naming) (§3, §7.2)
- [ ] **Hub**: 5 modules, content-neutral (§6)
- [ ] **Modules, 3 levels each**:
  - [ ] Numbers (§4.1 — Phase 1 **vertical slice: L1 numbers-to-20, L4 add-within-20, L7 subtract-within-100** — count + add + subtract, not three contiguous counting levels)
  - [ ] Words — all 4 sub-modes scaffolded (§4.2)
  - [ ] Keyboard (§4.3)
  - [ ] Code — block-based, grid, randomized levels (§4.4)
  - [ ] Translation (§4.5)
- [ ] **Lesson session flow**: sample 7 from pool → play → stars → unlock next (Appendix B.5)
- [ ] **Event capture (the point of Phase 1)**:
  - [ ] Cross-module events (§9.3), incl. `lesson_started` with `trigger` + `position_in_session`
  - [ ] Typing: `typing_keystroke`, `typing_word_completed` (§9.2)
  - [ ] Code: `code_run`, `code_level_solved` (§9.2)
  - [ ] Build-sentence: `sentence_build` (§9.2)
  - [ ] Selection tasks: `selected_option` on `question_answered`; reading `passage_dwell_ms`
- [ ] **Sync engine**: push events + progress on launch / session_end / periodic; pull bundles (§8)
- [ ] **Gamification (content-neutral)**: stars, level progress, completion celebration (confetti + avatar) (§6.1-6.2)
- [ ] **Healthy-use guardrails**: daily target cap, ~20 min soft limit, look-away breaks (§6.3) — *no streak-guilt, no FOMO*
- [ ] **FR/EN toggle**

## 5. Parent surface (`(parent)` route group in `apps/web`) — Phase 1 minimal

> Phase 1 = just enough to classify sessions and read adherence. The rich dashboard is Phase 2.

- [ ] Next `(parent)` route group at `parents.gabee.app`, parent login (Supabase Auth)
- [ ] Minimal `(marketing)` landing at `gabee.app` with a parent sign-up entry (full marketing copy can come later)
- [ ] **Session classification queue**: list pending sessions, one-tap label each (child-initiated / prompted / not sure) (§13.2)
- [ ] **Data view** (§13.4): per child, per week —
  - [ ] Active days + volition signals (retries/replays/continued) + classification summary — *adherence*
  - [ ] Completion rate + session length + modules touched + drop-off — *engagement*
  - [ ] Levels unlocked + accuracy trend + one skill gain — *learning*
  - [ ] Free-text observation field per child
  - [ ] Parent-willingness readout (§9.5)
- [ ] Email-link entry point lands here from the digest

## 6. Content seeding

- [ ] ~60 questions per module (5 modules), **both FR and EN**, seeded directly into Postgres via `packages/db` seed scripts (§12 Phase 1)
- [ ] Distractors tagged with `error_type` where applicable (highest-leverage analytics win — §9.2)
- [ ] Bilingual parity check in the seed script: refuse to seed a language-dependent question missing a language (§5)

## 7. Cross-cutting

- [ ] **i18n**: web app via **next-intl**, kid app via **i18next**; all kid-facing strings FR/EN; content via `{ fr, en }`
- [ ] **Privacy**: per-child data, parent-only access; no third-party analytics SDKs (§9.1)
- [ ] **Offline correctness**: full session playable with no network; events never lost across reconnect (§8)
- [ ] **Observability**: basic structured logging + error capture in the Next app (route handlers)

## 8. Definition of done (pilot-ready)

- [ ] A child can: be onboarded, play all 5 modules offline, earn stars, progress levels
- [ ] Every event in §9.2/§9.3 lands in Postgres after sync, verified end-to-end
- [ ] You can open the parent dashboard (`parents.gabee.app`), classify sessions from an email digest, and read the §13.4 data view for each child
- [ ] Seed content is reviewed and bilingual-complete
- [ ] Pilot devices set up; digest email delivers

---

### Suggested stack (locked)
TypeScript everywhere · monorepo pnpm + Turborepo · **one Next.js (App Router) app** = landing + parent + admin + API route handlers (no separate backend) · **Zod** contracts · **Prisma + Supabase Postgres** · **Supabase Auth** · web i18n **next-intl** · kid app **Vite + React PWA** (Dexie · vite-plugin-pwa · Zustand · TanStack Query · Motion · Howler · **i18next**) calling the API via CORS + parent JWT · **Mailgun** email · single domain **`gabee.app`** (`parents.` / `admin.` / `api.` / `kids.`) · preprod **Vercel**, production **VPS**.
