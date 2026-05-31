# Gabee — Admin Spec v0.2 (MVP)

The admin back office on `admin.gabee.app`. Ships alongside the kid app + parent dashboard once Phase 1 is validated and we're ready to author content in-product rather than via seed scripts.

- **Companions**: `product-spec-v0.1.md` (the *what*), `gabee-ux-spec.md` (kid + parent UX), `gabee-design-spec.md` (tokens & brand).
- **Conventions**: same state vocabulary as the UX spec — `Default` · `Loading` · `Empty` · `Error` · `Offline` · `Disabled`. Flows numbered `A#`. Microcopy mostly in **EN** here (admin is internal); the UI itself is bilingual FR / EN, switchable from the top bar.
- **Visual identity** (full spec in `gabee-design-spec.md §11`):
  - **Wordmark** — text-only **"Ga-Bee"** (Mulish 800 ink). **No bee illustration in the wordmark.**
  - **Mascot** — the bee appears in admin illustrations (loading, empty states, success toasts, decoration) with a **coral body** (`--mascot-admin` = `#FF8A6B`). Everything else of the bee (cyan eyes, ink visor, light-cyan wings, dark stripes, antennae) is identical to the other surfaces.

> **Scope discipline.** This is the **MVP admin**: one default content set shared by everyone, fixed structure (10 levels per module, 3 lessons per level, 7 questions per session, ≥ 20-question pool — same constants as the product spec). The full multi-curriculum engine (per-class, per-age, per-language, parent-configurable) is documented in §15 as the Phase 3+ vision; **don't build it yet**.

---

## 1. Purpose & mental model

For the MVP, Gabee ships with **one default content set** — same modules, same level structure, same questions for every child. The kid-side variety comes from the random draw of 7 questions out of a ≥ 20-question pool per level (product spec §5), not from per-child curricula.

The admin runs two things in MVP:

1. **Content authoring** — the AI-enhanced flow we already designed: for each `(module, level)`, the AI proposes a **plan** (scope + pedagogical objectives + validation criteria) with the previous levels as context (continuity by construction); admin reviews / edits / accepts; AI generates a batch of **question candidates** against the plan; admin reviews (rate 1-5 / edit / reject) and confirms the top *X* into the live pool.
2. **Operations** — users (parents, children, admins), landing inbox, GDPR requests, parent feedback, analytics, AI usage, system logs.

**The five modules (Numbers, Words, Keyboard, Code, Translation) are fixed first-class entities** (§5). The maths module always exists; what an admin authors is the *content for it*. Nothing about the module identity, sub-modes, or event types is per-child or per-curriculum in MVP.

**Data-model note for Phase 3 readiness.** We keep a `Curriculum` row in the database with a single seeded value (`default`). The MVP admin does not expose curriculum management; every plan and question references the `default` curriculum implicitly. When Phase 3 unlocks multi-curriculum, it's a UI exposure change, not a data migration.

---

## 2. Roles & permissions

| Capability | super_admin | admin |
|---|---|---|
| View modules (§5) | ✓ | ✓ |
| Edit module metadata / disable | ✓ | — |
| Add a new module (rare, requires eng support) | ✓ | — |
| Generate plans + content via AI | ✓ | ✓ |
| Review / rate / edit / confirm content | ✓ | ✓ |
| Manage parents & children | ✓ | ✓ |
| Manage GDPR requests | ✓ | ✓ |
| Read landing inbox & feedback | ✓ | ✓ |
| Invite / remove admins | ✓ | — |
| Change roles | ✓ | — |
| Read analytics + AI usage + logs | ✓ | ✓ |

**Server-side enforcement of every capability** — every protected route handler re-checks the role; the UI hides what the role can't do but the server is the final word.

The **educator** role is deferred to Phase 3 (§15). Until then, only `super_admin` and `admin` exist.

---

## 3. Information architecture

Left nav, all routes under `admin.gabee.app/`:

```
Dashboard            ← landing screen, decision metrics first
Modules              ← the 5 fixed module identities + ops state
Content              ← the AI authoring flow: module × level matrix → plan / pool
Users
  ├─ Parents
  ├─ Children
  └─ Admins          (super_admin only for create/role change)
Inbox                ← landing contact-form messages
GDPR requests        ← manual workflow queue
Feedback             ← parent ratings & comments
Analytics            ← decision metrics deep-dives
Operations
  ├─ AI usage        ← tokens / cost / calls per provider, model
  ├─ System logs     ← errors, slow requests, email deliverability
  └─ Audit log       ← sensitive actions trail
Settings             ← profile, account, language
```

Top bar carries: current user + role, language toggle (FR / EN), search (global), notifications (new feedback, new GDPR, new inbox).

---

## 4. Global patterns

### 4.1 State catalog

| State | Treatment |
|---|---|
| `Loading` | Skeleton rows / cards. No spinners-of-doom. |
| `Empty` | Friendly empty card explaining what would fill it + the one action that creates the first item. |
| `Error` | Inline error with retry; **never lose what the admin typed** (preserve form values). |
| `Offline` | Banner ("Last synced …"). Read-only; mutating actions disabled with tooltip. |
| `Disabled` | Dimmed with tooltip stating the reason (usually a permission check). |

### 4.2 AI generation

| Generation type | UX |
|---|---|
| **Plan** (one level) | **Streaming** — admin sees the plan materialize live. Cancel / regenerate available. Short output, low latency. |
| **Question pool** (batch of ~30 candidates) | **Batch with progress bar** ("12 / 30"). Cancel available; results appear when batch completes. |

Both prompts always include: the target module / level, the **plan of the current level**, and the **plans + sample confirmed questions of the previous levels** (continuity by construction). If a previous level has no accepted plan yet, the generator refuses and points the admin to plan it first.

### 4.3 Review pattern (questions)

Every candidate card shows: prompt (FR + EN side by side, **parity enforced** — can't confirm if one language is empty), answer(s), the `(module, level, objective)` it satisfies, and a **1-5 star control + a comment box + Reject**. Inline edit before rating. A counter shows progress toward `pool_size`; once enough candidates are rated ≥ 4, **Confirm pool** unlocks and promotes the top *X*.

### 4.4 Audit log

Sensitive actions write a row to the `AuditLog`: actor, role, action, target, timestamp, before/after diff for edits. Logged actions: module metadata edit / disable, plan accept / edit, question pool confirm / demote, user invite / remove / role-change, GDPR action, parent suspend. The log is visible under **Operations → Audit log**, filterable by actor / kind / date.

### 4.5 Bilingual parity

Every content object that lives in both languages (`Question`, `ContentPlan` objectives) stores a `{ fr, en }` pair. Validation refuses confirm / publish if one side is missing or trivially short (stub catcher). Per-language ratings are kept separately so an EN candidate can be strong while its FR pair is weak.

---

## 5. Modules

Modules are **fixed, first-class entities** — independent of any content. Numbers, Words, Keyboard, Code, and Translation always exist. What an admin authors is the content *for* them; nothing about module identity changes between content sets, kids, or sessions.

### 5.1 Concepts

A **`Module`** holds:
- **Identity** — `id` (`numbers` | `words` | `keyboard` | `code` | `translation`), `slug`, `name { fr, en }`, `description { fr, en }`
- **Visual identity** — `color_token` (matches `--module-*` from the design spec), `icon`
- **Characteristics** — `input_methods`, optional `sub_modes` (Words has 4: picture-to-word, fill-the-blank, build-the-sentence, read-and-answer), `voiceover` flag (true for Keyboard + Translation, product spec §4.7), `event_types` (analytics events emitted, product spec §9.2)
- **Lifecycle** — `status` ∈ `active` / `disabled` (kill switch — disabled modules disappear from every kid hub)

### 5.2 Flows

- **A0 · View modules** — open the screen → five module cards with ops summary. Click into one for the detail view.
- **A0a · Edit module metadata** (`super_admin` only) — from M2, edit display name / description / color / icon. Rare; writes to audit log; ripples through kid UI and design-token map.
- **A0b · Disable a module** (`super_admin` only, rare) — soft kill: status → `disabled`, the module disappears from kid hubs. Confirm dialog shows impact ("This module is used by ~312 children"). Re-enable any time.

### 5.3 Screens & states

**M1 · Modules list**
- *Content*: five module cards in a calm grid, each showing color block, name (FR / EN per UI language), slug, sub-mode count (Words), voiceover flag, status chip, and a small ops summary — `# confirmed questions` and `# pending plans`.
- *Actions*: super_admin sees **Edit metadata** on hover; admins see view-only.
- *States*: `Default`, `Loading` (skeleton cards), `Error`.

**M2 · Module detail**
- *Content*: header (color + name + status); **Identity** card (FR/EN name, slug, description, color token, icon); **Characteristics** card (input methods, sub-modes if any, voiceover, event types — with links into product spec §4.x and §9.2); **Content state** table (per level: plan accepted Y/N, pool confirmed / target); **Audit trail** for this module.
- *Actions*: super_admin sees **Edit metadata** and **Disable**; admins see view-only.
- *States*: `Default`, `Loading`, `Error`, `Disabled` (whole module disabled — shown clearly).

---

## 6. Content (the AI authoring flow)

This is where admins spend most of their time. The structure is fixed (10 levels per module, 3 lessons per level, 7 questions per session, ≥ 20-question pool — all from product spec §2, §4, §5); the admin's job is to fill the pool for each `(module, level)` with high-quality plans and questions.

### 6.1 Concepts

A **`ContentPlan`** per `(module, level)` holds:
- `scope` — one-paragraph summary of what this level covers
- `pedagogical_objectives` — list (e.g. "add two numbers ≤ 20 with no carry")
- `validation_criteria` — how we know the child has mastered the level (translates into the pool's question distribution)
- `notes` — free, admin-only
- `status` ∈ `pending` / `ai_draft` / `accepted`

A **`Question`** is rattached to `(module, level)`, stores `{ fr, en }` content, type (product spec §4.x), an answer key, optional `objective_ref` pointing at one of the plan's objectives, per-language ratings, and `status` ∈ `candidate` / `confirmed` / `rejected` / `demoted`.

### 6.2 Flows

**A1 · Plan a level**
1. From **Content** (the module × level matrix), click a cell (e.g. *Numbers level 3*) → opens the **Plan editor** (C2). Requires that all previous levels in this module already be `accepted` — otherwise the editor refuses and points to the gap.
2. Click **Generate plan**. AI streams a plan into the editor with previous-level objectives in context. Admin can stop, regenerate, or edit inline.
3. **Accept** → status becomes `accepted` and the matrix cell turns green.

**A2 · Generate the question pool**
1. From C2's **Pool tab** (C3), click **Generate questions**. Choose batch size (default `pool_size × 1.5` for headroom). Confirm.
2. Progress bar runs ("17 / 30"). Cancel or wait. When done, candidates fill the queue.

**A3 · Review questions**
1. Each card shows FR + EN, answer, target objective, rate / edit / reject.
2. Header tracks "Rated ≥ 4: 18 / 20" until threshold is met.

**A4 · Confirm top X**
1. Once threshold is met, **Confirm pool** unlocks. Click → top *X* by score become `confirmed`. Pool is now live — kids start drawing from it on their next session.

**A5 · Edit live**
- Confirmed questions, accepted plans, and module metadata can be edited any time. Changes propagate at the next kid session. Every edit writes to the audit log.
- **Demoting** a confirmed question reopens a slot — the next-highest-rated `candidate` is auto-promoted.

### 6.3 Screens & states

**C1 · Content overview** (the module × level matrix)
- *Content*: rows = 5 modules, columns = 10 levels. Each cell shows two pips: *plan status* (pending / ai_draft / accepted) and *pool fill* (0/20, 12/20, 20/20 confirmed). Color-coded for quick read.
- *Filters*: module, status (incomplete plans / under-filled pools / all done).
- *Actions*: click a cell → C2.
- *States*: `Default`, `Loading`, `Error`.

**C2 · Plan editor** (one level)
- *Content*: header (module / level / status); previous-level objectives collapsed for context; the plan fields (scope, objectives list, validation criteria, notes); **Generate plan** / **Regenerate** / **Accept** buttons; bilingual editor (FR + EN side by side).
- *States*: `Default`, `Loading` (AI streaming), `Error` (preserve partial output), `Disabled` (previous level not accepted yet — with a link to the gap).

**C3 · Question pool** (one module × level)
- *Content*: header (objectives reminder), generation controls, progress bar; candidate cards (FR + EN side-by-side, type, target objective, answer key, **rate / edit / reject**); pool-progress counter; **Confirm pool** when threshold met; toggle to view confirmed pool separately.
- *States*: `Default`, `Loading` (batch generating, with progress), `Empty` (no candidates yet), `Error` (preserve edits), `Disabled` (plan not accepted).

**C4 · AI generation modal**
- Slim modal previewing the prompt: difficulty hint, themes to favor / avoid, free-text additional instructions. Default = "use the plan as-is." Confirm or cancel.

---

## 7. Users

### 7.1 Parents
- **U1 · Parents list** — table (email, name, created, # children, status). Search by email / name. Filters: status, creation date.
- **U2 · Parent detail** — identity, devices paired, children, recent activity, suspend toggle, manual erase trigger (creates a GDPR request, §9). States standard.

### 7.2 Children
- **U3 · Children list** — table (name, parent, age, last active, total session time / week).
- **U4 · Child detail** — identity, parent link, progress per `(module, level)`, recent sessions, classification queue status (sessions awaiting parent label). Read-only in MVP — there's no per-child overrides yet (those are §15 future).

### 7.3 Admins
- **U5 · Admins list** — table (email, name, role, status, invited by, last login).
- **U6 · Invite admin** (`super_admin` only) — email + name; sends invite via Mailgun. On accept, prompts password.
- Role change (`super_admin` only). Remove (`super_admin` only).

---

## 8. Inbox (landing contact form)

The landing page has a contact form; submissions land here.

- **I1 · Inbox list** — table (date, name, email, subject snippet, status). Filters: status, date range. Statuses: `new` / `read` / `replied` / `archived`.
- **I2 · Message detail** — full message, sender, mark replied (manual — replies go from Gmail, not in-app), archive. Top-bar badge when there's anything `new`.

---

## 9. GDPR requests (manual workflow)

MVP ships as a queue + checklist; automation comes later.

- **G1 · Requests list** — table (date, kind: `access` / `export` / `erase`, requester, status, owner). Filter by kind / status.
- **G2 · Request detail** — three-step checklist:
  1. **Verify identity** (free-text notes on how it was verified).
  2. **Execute** — actions to take (export = build a JSON of child data + sessions CSV; erase = confirm + irreversibly delete child rows + audit log).
  3. **Respond** (mark user-facing email sent, paste timestamp + summary).
- Each step is **manually marked complete**; the system enforces sequence (can't execute before verify). All write to audit log. Status: `new → verifying → in_progress → done`.

---

## 10. Feedback (parent ratings)

Parents can rate 1-5 and comment on a **module / level / lesson** from the parent app. Surfaces here.

- **F1 · Feedback list** — table (date, parent, child age, scope, target, rating, comment snippet, status). Filters: scope, module, rating, status (`new` / `triaged` / `closed`).
- **F2 · Feedback detail** — full comment, context (target object linked to its plan / pool), parent identity, child age, admin notes. Actions: tag (*bug*, *content quality*, *encouragement*, *out of scope*), close, link to a content edit, reply (email via Mailgun, templated).

---

## 11. Analytics & observability

### 11.1 Dashboard (admin home)

Decision metrics first (product spec §13), then operational context.

1. **North star** — Weekly active learning days per child (median + distribution). One number, large.
2. **Three signals row** (product §13.2):
   - **Adherence** — combined index of in-app volition (retry / replay / continued-play) + classification share (self-initiated) + parent willingness. One number + sparkline.
   - **Engagement quality** — session length within healthy band, % sessions ending naturally vs cap-hit, hint usage trend.
   - **Learning** — % of children reaching mastery thresholds per `(module, level)`; per-language for the language-dependent modules.
3. **Operational tiles** (smaller, below): new registrations (7d / 30d), active children (7d), recent sessions count, recent plays heatmap (day × hour).

Global filters: time range, language, cohort.

### 11.2 Decision-metric deep-dives

- **A1 · Adherence** — funnel from launch → first session → second day → 7-day return; volition events per child; classification queue stats (avg response latency, % self-initiated by classified parent — both raw and *willingness-adjusted*).
- **A2 · Engagement quality** — session duration distribution, end-reason breakdown (natural / quit / cap), hint rate per level, drop-off funnel per module × level.
- **A3 · Learning** — per `(module, level)`: % correct, time-to-mastery, top failing objectives (linked back to the plan to identify weak ones).

### 11.3 Operational metrics

- **O1 · AI usage** — tokens / cost / call volume per provider × model × purpose (plan-generation vs question-generation), over time. Daily and cumulative views. Cost projection for the rest of the month.
- **O2 · System logs** — error rate, slow requests, recent exceptions list with stack traces; Mailgun deliverability (sent / opened / bounced / failed) for classification digests + transactional email.
- **O3 · Audit log** — already documented in §4.4.

---

## 12. Data model

Sketched as Zod-style records to fit `packages/types`. Phase-3-ready: the `Curriculum` row exists with a single seeded value so the multi-curriculum unlock is UI-only later.

```ts
Module {
  id: 'numbers' | 'words' | 'keyboard' | 'code' | 'translation'  // fixed set, code-defined
  slug: string
  name: { fr: string, en: string }
  description: { fr: string, en: string }
  color_token: string             // matches --module-* design tokens
  icon: string
  characteristics: {
    input_methods: Array<'mouse' | 'keyboard' | 'drag' | 'touch'>
    sub_modes?: Array<{ id: string, name: { fr: string, en: string } }>  // Words: 4 sub-modes
    voiceover: boolean            // Keyboard + Translation
    event_types: string[]         // product spec §9.2
  }
  status: 'active' | 'disabled'
  created_at: Date
  updated_at: Date
}

// Single seeded row in MVP — admin UI does not expose curriculum management
Curriculum {
  id: string                      // seeded as 'default' in MVP
  name: string                    // 'Gabee default content (MVP)'
  is_default: boolean             // true for the seeded row
  // Phase 3+ fields (class, age_range, language_mode, config, ...) live here
  // but are not editable in the MVP UI. See §15.
  created_at: Date
  updated_at: Date
}

ContentPlan {
  id: string
  curriculum_id: string           // always references the default curriculum in MVP
  module_id: Module['id']
  level: number                   // 1..10
  scope: { fr: string, en: string }
  pedagogical_objectives: Array<{ fr: string, en: string }>
  validation_criteria: { fr: string, en: string }
  notes?: string                  // admin-only
  status: 'pending' | 'ai_draft' | 'accepted'
  ai_meta?: { provider, model, tokens, generated_at }
  accepted_by?: string
  accepted_at?: Date
}

Question {
  id: string
  curriculum_id: string           // always references the default curriculum in MVP
  module_id: Module['id']
  level: number
  objective_ref?: string          // points to a ContentPlan objective
  type: enum                      // product spec §4 (picture_to_word, fill_blank, ...)
  content: { fr: QuestionContent, en: QuestionContent }
  answer_key: ...
  ratings: { fr: { score, count }, en: { score, count } }
  per_language_comments: { fr: string[], en: string[] }
  status: 'candidate' | 'confirmed' | 'rejected' | 'demoted'
  promoted_at?: Date
}

InboxMessage {
  id: string
  name: string
  email: string
  subject?: string
  message: string
  status: 'new' | 'read' | 'replied' | 'archived'
  source: 'landing_contact'
  created_at: Date
  read_by?: string
  read_at?: Date
}

GDPRRequest {
  id: string
  kind: 'access' | 'export' | 'erase'
  parent_id?: string
  email: string
  notes: string
  status: 'new' | 'verifying' | 'in_progress' | 'done'
  steps: {
    verified_at?: Date, verified_by?: string, verification_notes?: string
    executed_at?: Date, executed_by?: string, execution_notes?: string
    responded_at?: Date, responded_by?: string, response_summary?: string
  }
  created_at: Date
}

Feedback {
  id: string
  parent_id: string
  child_id?: string
  scope: 'module' | 'level' | 'lesson'
  target: { module_id: Module['id'], level?: number, lesson_id?: string }
  curriculum_id: string           // always 'default' in MVP
  rating: 1 | 2 | 3 | 4 | 5
  comment?: string
  status: 'new' | 'triaged' | 'closed'
  tags: string[]
  notes?: string
  closed_by?: string
  closed_at?: Date
  created_at: Date
}

AdminUser {
  id: string
  email: string
  name: string
  role: 'super_admin' | 'admin'    // educator deferred to Phase 3
  status: 'active' | 'invited' | 'suspended'
  invited_by?: string
  created_at: Date
  last_login_at?: Date
}

AuditLog {
  id: string
  actor_id: string
  actor_role: 'super_admin' | 'admin'
  kind: enum                       // 'module.edit', 'plan.accept', 'pool.confirm', ...
  target_kind: string
  target_id: string
  diff?: any                       // before/after for edits
  created_at: Date
  ip?: string
}
```

---

## 13. Cross-cutting

- **Accessibility** — desktop-first web; ≥ 44px targets, keyboard navigation, focus rings, AA contrast. Forms preserve typed content through errors.
- **i18n** — admin UI in FR + EN, switchable from the top bar; defaults to FR. Content authoring shows FR + EN side by side (parity enforced) regardless of UI language.
- **Permissions** — every protected route handler checks the role server-side. UI hides what the role can't do; the server is final.
- **Performance** — list views paginate (50 by default) with virtualization for very long tables.

---

## 14. Open questions

| # | Question |
|---|---|
| 1 | **Question content schema per type** — the per-type content shape (block sequences for Code, word-cloud for Build-a-sentence, etc.) needs its own mini-spec before generation can run. |
| 2 | **GDPR export format** — JSON only, or also a CSV of sessions for parents who want to read? |
| 3 | **Notifications** — top-bar badge is enough? Or daily email digest of new feedback / GDPR / inbox to admins? |

---

## 15. Future (Phase 3+): the multi-curriculum engine

Deferred from MVP. Documented here so the design work isn't lost and the data model stays compatible.

**What's deferred:**

- **Multi-curriculum** — replace the single `default` curriculum with many (`CP bilingue Cameroun`, `Vacances révisions`, `Champions maths`, …). A child is assigned to one. `Curriculum` gains `class`, `age_range_min/max`, `language_mode` (`fr` | `en` | `bilingual`), `country_context`, `duration_weeks`, `included_modules` (subset of `Module.id`), and a per-curriculum `config` (`levels_per_module`, `lessons_per_level`, `questions_per_session`, `pool_size_per_level`).
- **Standards library** — curated `Curriculum` rows admins can fork.
- **Per-curriculum AI authoring** — same flow as MVP §6, scoped to a curriculum × module × level. Plans use *that curriculum's* previous-level context.
- **Curriculum lifecycle** — `draft` / `active` / `archived`; activation requires every included module × level to have an accepted plan and a confirmed pool.
- **Parent controls per child** — `module_visibility: Record<Module.id, boolean>` (hide a module from a kid) and `module_focus?: Module.id` (highlight one). Set per child by the parent.
- **Educator role** — `role: 'educator'`, scoped to specific curricula; can rate / suggest / annotate but not confirm. `AdminUser.curricula_scope?: string[]`.
- **Multi-curriculum analytics** — every dashboard gets a curriculum filter; learning metrics break down per curriculum.
- **Auto-assignment** — when a parent creates a child profile with class + age + language, the system picks the matching standard curriculum and assigns it (parent can change).

**Migration plan** — the MVP data model already supports all of the above structurally (every content row references `curriculum_id`). Phase 3 = expose the UI + seed standards; no data migration.

