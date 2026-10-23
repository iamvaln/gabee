# Content Studio — Phase 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship, by 2026-10-27, the end-to-end editorial loop in the admin "Communication" section — directions → week titles → daily drafts for LinkedIn and TikTok → manual posting with feedback — plus the visit/source measurement it depends on, so the first loop post goes out on 2026-10-29.

**Architecture:** A new `content-studio` service layer in `apps/web/src/lib/server/content-studio/` drives DB-backed state machines (week, slot, draft). Every AI call goes through a new task router (`lib/server/ai/router/`) that reads models, prices and per-task chains from the DB and meters every call. A 10-minute tick from the existing `cron-digest` sidecar runs idempotent jobs (generation, emails, reminders). Media live in a private Cloudflare R2 bucket behind a storage port. Landing visits and sign-up sources are recorded first-party, without cookies or IPs.

**Tech Stack:** Next.js 16 (app router, `route()` handlers), Prisma 7 + Postgres, zod 4 contracts in `@gabee/types`, `@anthropic-ai/sdk` (^0.100), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (new), `node:test` via `tsx`, Playwright (admin project), plain CSS in `admin/admin.css`.

**Spec:** `docs/superpowers/specs/2026-10-20-content-studio-design.md` — read it first; this plan argues from it.

## Global Constraints

- Work on branch `feat/content-studio-1a` in a worktree off `origin/develop`; PR base `develop` (gitflow). Copy `packages/db/.env` and `apps/web/.env.local` into the worktree and run `prisma generate` before building.
- Launch platforms: **`linkedin`, `tiktok`** only. Platform keys are data (`CONTENT_PLATFORMS`), X/Facebook are not built.
- Language per (day, platform): `fr` default; **each platform ≥ 2 `en` posts per full week**; partial week of ≤ 4 days: ≥ 1 per platform. Owner may override (UI flags it).
- Studio timezone default **`Africa/Douala`**. Schedule (studio-local): `week.propose` Sun 06:00 · `week.email` Sun 07:00 · `week.remind` Sun 15:00 & 20:00 · `day.generate` 04:00 · `day.notify` 05:00 · `day.remind` 09:00 & 13:00 · `budget.check` hourly. Tick every 10 min.
- AI: no model id or price in business code — read from `ai_models` / `ai_task_routes`. Seeded default model for every task: **`claude-opus-5-5`** ($4 / $20 per MTok). Also seed (enabled, not routed) `claude-sonnet-5-5` ($2 / $10) and `claude-haiku-5-5` ($0.10 / $0.50). Thinking adaptive (omit `thinking`), effort set per route. Server-side refusal fallback on: beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`. App-level chain falls back **only** on outage (429, ≥ 500/529, timeout, connection), **never** on refusal or 400/422.
- Budget covers Communication tasks only (`ai_usage.task` not null). Phase 1a: alert email at threshold; hard stop is Phase 1b.
- Media: private R2 bucket; presigned GET ≤ 15 min, `Content-Disposition: attachment`, readable file name `YYYY-MM-DD-<platform>-<slug>.<ext>`; uploads via presigned PUT then server verification. Allowed MIME: `image/png`, `image/jpeg`, `image/webp`, `video/mp4`. Caps: images 15 MB, videos 300 MB. Imported `docs/Comm` assets start `not_cleared`.
- Tracked links: only Gabee domains (`gabee.app`, `parents.gabee.app`, `kids.gabee.app`); params `utm_source=<platform>&utm_medium=social&utm_campaign=<week slug>&utm_content=<draft id>`; TikTok uses the bio link `utm_source=tiktok&utm_medium=social&utm_content=bio`.
- Visits: no cookie, no stored IP, no cross-site id. Bot UAs dropped. Endpoint rate-limited per IP (in memory) and same-origin only.
- Admin copy: French first, English via the existing `admin_lang` cookie pattern (`L ? 'fr' : 'en'`). Plain words; every error says what happened and what to do.
- Access: `requireAdmin` for weeks/drafts/media/publication; `requireSuperAdmin` for settings, editorial line, objective, recipients; every mutation calls `writeAudit`.
- No swallowed errors: every caught error is rethrown, or recorded on its run row **and** sent with `Sentry.captureException` (via the `reportError` helper of Task 2).
- Secrets only in env (`ANTHROPIC_API_KEY`, `R2_*`); `.env.production.example` gets empty placeholders only.
- Tests: `node:test` + tsx; integration tests import `src/test/setup-integration` first and use the fake AI adapter and the in-memory storage adapter — **no network in tests**. Coverage thresholds are not lowered.
- Commit messages: no `Co-Authored-By` / "Generated with" lines (owner rule).

## Review Focus

1. **Day boundaries in the studio timezone** — a week validated at 23:30 Saturday Douala time, or a 04:00 Douala job (03:00 UTC), must use studio-local dates for `day:` and `week:` keys, not UTC dates. → Task 9 test `dayKey uses studio-local date across UTC midnight`.
2. **Concurrent generation** — two ticks, or the 04:00 job racing an owner "Régénérer", must never create two drafts for one (slot, platform) or run two generations at once. → Task 7 test `generateDraftsForDay is idempotent and single-flight per draft`.
3. **Schema-valid but unusable AI output** — a TikTok draft with neither a video choice nor a filming plan, a LinkedIn body over 3,000 chars, or a link outside the allow-list must be rejected as invalid output, not stored. → Task 6 test `post outputs violating platform rules are invalid`.
4. **Phone layout with long tokens** — a 360 px wide screen with an unbroken hashtag string or URL must not scroll horizontally; "Copier le texte" must work from a tap on iOS Safari (user gesture, HTTPS). → Task 11 e2e `today screen fits a 360px viewport`.
5. **Upload that never completes or lies about its type** — an asset row whose object is missing, or an `.mp4` whose bytes are HTML, must stay unusable and say why. → Task 5 test `register rejects missing object and sniffed-mime mismatch`.

---

### Task 1: Contracts in `@gabee/types`

**Files:**
- Create: `packages/types/src/content-studio.ts`
- Modify: `packages/types/src/index.ts` (add `export * from './content-studio';`)
- Test: `packages/types/test/contracts.test.ts` (append a `describe('content studio', …)` block)

**Interfaces:**
- Produces (all exported):
  - `CONTENT_PLATFORMS = ['linkedin','tiktok'] as const`, `ContentPlatform`; `CONTENT_LANGUAGES = ['fr','en'] as const`, `ContentLanguage`.
  - `SLOT_FORMATS = ['text','visual','gameplay_video','presentation_video','story'] as const`.
  - `WEEK_STATUSES = ['proposing','proposals_ready','direction_set','titles_ready','validated','skipped'] as const`; `SLOT_STATUSES = ['proposed','validated','drafting','drafted','done','skipped'] as const`; `DRAFT_STATUSES = ['generating','ready','approved','published','failed','stale'] as const`.
  - `OBJECTIVE_TYPES = ['signups','daily_activity','paid_conversion','awareness'] as const`.
  - `AI_TASKS = ['content_strategy','content_titles','post_linkedin','post_tiktok','art_direction','report_narrative','stats_from_screenshot','image_generation','video_generation'] as const`, `AiTask`; `AI_CAPABILITIES = ['text','vision','image','video'] as const`; `AI_TASK_CAPABILITY: Record<AiTask, AiCapability>`.
  - `AGENT_KEYS = ['strategist','writer_linkedin','writer_tiktok','art_director','analyst'] as const`, `AgentKey`; `AGENT_TASK: Record<AgentKey, AiTask>`.
  - `JOB_KEYS = ['week.propose','week.email','week.remind','day.generate','day.notify','day.remind','budget.check'] as const`.
  - Agent output schemas: `DirectionProposalsSchema` (`{ proposals: [{ title, rationale, evidence: string[], sample_angles: string[] }] }`, exactly 3), `WeekTitlesSchema` (`{ days: [{ date: 'YYYY-MM-DD', topic, angle, format, platforms: [{ platform, language }], sources: [{ title, url }] }] }`), `LinkedInPostSchema` (`{ body, hashtags: string[], link_target: 'landing'|'signup' }`), `TikTokPostSchema` (`{ caption, hashtags, on_screen_text: string[], mode: 'library_video'|'filming_plan', filming_plan?: { hook, shots: string[], duration_s } }`), `ArtDirectionSchema` (`{ media_asset_id: string|null, visual_brief }`), `ReportNarrativeSchema` (`{ headline, highlights: string[], watch_outs: string[] }`).
  - Admin request schemas: `ChooseDirectionRequestSchema` (`{ proposal_index: 0|1|2, refinement: string ≤ 2000, platform_angles: Partial<Record<ContentPlatform, string ≤ 500>> }`), `UpdateSlotRequestSchema`, `UpdateDraftRequestSchema` (`{ body?, hashtags?, media_asset_id?: string|null }`), `MarkPublishedRequestSchema` (`{ post_url: z.url(), rating?: 1..5, comment?: ≤ 1000 }`), `SkipDayRequestSchema` (`{ reason: 1..300 }`), `StudioSettingsUpdateSchema`, `ObjectiveUpsertSchema`, `EditorialLineUpdateSchema`, `MediaUploadInitSchema` (`{ file_name, mime, size_bytes }`), `MediaClearanceSchema` (`{ cleared: boolean, note? }`), `UtmSchema` (`{ source?, medium?, campaign?, content?, term? }`, each ≤ 120 chars) / `Utm`, `VisitBeaconSchema` (`{ path ≤ 300, referrer?: string ≤ 500, utm: { source?, medium?, campaign?, content?, term? } each ≤ 120, lang?: ContentLanguage }`), `SignupAttributionSchema` (same `utm` + `referrer_host?`).
  - Extend `SignupRequestSchema` in `packages/types/src/api/auth.ts` with `attribution: SignupAttributionSchema.optional()`.

- [ ] **Step 1: Write failing contract tests** — `test('DirectionProposalsSchema requires exactly 3 proposals')` (2 → fail, 3 → pass); `test('TikTokPostSchema requires filming_plan when mode is filming_plan')`; `test('WeekTitlesSchema rejects a platform outside CONTENT_PLATFORMS')`; `test('MarkPublishedRequestSchema rejects rating 0 and 6')`; `test('VisitBeaconSchema rejects a 121-char utm value')`; `test('SignupRequestSchema accepts optional attribution')`.
- [ ] **Step 2:** `pnpm --filter @gabee/types test` → FAIL (missing exports).
- [ ] **Step 3:** Implement `content-studio.ts` per the Interfaces block (`z.object(...).superRefine` for the TikTok mode rule); export from `index.ts`; extend `SignupRequestSchema`.
- [ ] **Step 4:** `pnpm --filter @gabee/types test && pnpm --filter @gabee/types run test:coverage` → PASS, coverage gate green.
- [ ] **Step 5:** Commit `feat(types): content studio contracts`.

### Task 2: Data model, migration, seed, error reporting helper

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_content_studio/migration.sql` (via `pnpm --filter @gabee/db run db:migrate -- --name content_studio`)
- Create: `packages/db/prisma/seed-content-studio.ts` (called from `seed.ts` `main()`), `packages/db/prisma/content-studio/agents/*.md` (agent instructions v1)
- Modify: `packages/db/src/testing.ts` (factories)
- Create: `apps/web/src/lib/server/report-error.ts`
- Test: `packages/db/prisma/content-studio-seed.test.mts`, `apps/web/src/lib/server/report-error.test.ts`

**Interfaces:**
- Produces Prisma models (conventions: uuid ids, `@map`/`@@map` snake_case, `createdAt`/`updatedAt`):
  - `StudioSettings` (id `'default'`): `timezone` (default `'Africa/Douala'`), `recipients String[]`, `enabledPlatforms String[]` (default `['linkedin','tiktok']`), `monthlyBudgetUsd Float` (default 50), `budgetAlertRatio Float` (0.8), `budgetAlertSentFor String?` (`'YYYY-MM'`).
  - `ContentObjective`: `month` (`'YYYY-MM'`, unique), `type`, `statement`, `targets Json?`.
  - `EditorialLineVersion`: `version Int` (unique), `body String` (markdown), `productFacts Json`, `publishedAt DateTime?`, `createdById String? @db.Uuid`.
  - `PlatformProfile`: `platform` (id), `objective`, `tone`, `rules Json` (`{ max_chars, hashtags_max, link_policy, emoji_policy }`), `mediaAspect` (`'16:9'|'1:1'|'9:16'`), `bioLink String?`.
  - `ContentWeek`: `startsOn DateTime @db.Date` (unique), `status`, `firstDay DateTime @db.Date` (partial weeks), `objectiveId?`, `proposals Json?`, `chosenIndex Int?`, `refinement String?`, `platformAngles Json?`, `validatedAt?`, `validatedById?`.
  - `ContentSlot`: `weekId`, `date @db.Date`, `topic`, `angle`, `format`, `platforms Json` (`[{platform, language}]`), `sources Json`, `status`, `skipReason?`; `@@unique([weekId, date])`.
  - `ContentDraft`: `slotId`, `platform`, `language`, `status`, `currentVersionId?`, `approvedVersionId?`, `mediaAssetId?`, `trackedUrl String`, `generationLockUntil DateTime?`, `error String?`; `@@unique([slotId, platform])`.
  - `ContentDraftVersion`: `draftId`, `n Int`, `source` (`'agent'|'owner'`), `agentVersionId?`, `payload Json` (the platform post schema), `editedById?`; `@@unique([draftId, n])`.
  - `ContentPublication`: `draftId` (unique), `postUrl`, `publishedAt`, `rating Int?`, `comment String?`, `recordedById`.
  - `MediaAsset`: `kind` (`image|video`), `objectKey` (unique), `fileName`, `mime`, `sizeBytes Int`, `width?`, `height?`, `durationS Float?`, `aspect String?`, `language String?`, `tags String[]`, `origin` (`upload|imported|generated|captured`), `checksum String?`, `status` (`pending|ready|rejected`), `rejectReason?`, `cleared Boolean @default(false)`, `clearanceNote?`, `uploadedById`.
  - `AiModel`: `key` (id, e.g. `claude-opus-5-5`), `provider`, `capabilities String[]`, `inputUsdPerMTok Float`, `outputUsdPerMTok Float`, `enabled Boolean`, `consecutiveFailures Int @default(0)`, `unhealthyUntil DateTime?`.
  - `AiTaskRoute`: `task`, `rank Int`, `modelKey`, `effort String` (`low|medium|high|xhigh|max`), `maxTokens Int`; `@@unique([task, rank])`.
  - `Agent`: `key` (id), `publishedVersionId?`. `AgentVersion`: `agentKey`, `version Int`, `instructions String`, `settings Json`, `publishedAt?`; `@@unique([agentKey, version])`.
  - `AgentRun`: `agentKey`, `agentVersionId`, `origin` (`scheduled_job|user_action|trial`), `subjectKind`, `subjectId`, `inputHash`, `input Json`, `output Json?`, `status` (`running|succeeded|invalid_output|failed`), `errorCode?`, `errorMessage?`, `latencyMs?`, `startedAt`, `finishedAt?`.
  - `JobRun`: `jobKey`, `periodKey`, `status` (`running|succeeded|failed`), `attempts Int`, `nextAttemptAt?`, `error?`, `startedAt`, `finishedAt?`; `@@unique([jobKey, periodKey])`.
  - `StudioNotification`: `kind`, `periodKey`, `recipient`, `providerId?`, `status` (`sent|failed`), `error?`; `@@unique([kind, periodKey, recipient])`.
  - `WebVisit`: `occurredAt`, `day @db.Date`, `path`, `lang?`, `deviceClass` (`mobile|tablet|desktop`), `source` (utm_source or referrer host or `'direct'`), `medium?`, `campaign?`, `content?`, `referrerHost?`; `@@index([day, source])`, `@@index([content])`.
  - Extend `AiUsage`: `task String?`, `origin String?`, `agentRunId String? @db.Uuid`, `latencyMs Int?`, `errorCode String?`, `status String @default("succeeded")`; `@@index([task, createdAt])`.
  - Extend `ParentAccount`: `signupSource Json? @map("signup_source")` (`{ source, medium?, campaign?, content?, referrer_host? }`).
- Produces seed (create-only upserts, never clobber admin edits): `StudioSettings` default row (recipients from `ADMIN_DIGEST_TO` if set); the 3 `AiModel` rows; one route per task (rank 1, `claude-opus-5-5`) with effort/maxTokens: strategy `high`/16000, titles `high`/16000, post_linkedin `medium`/8000, post_tiktok `medium`/8000, art_direction `low`/4000, report_narrative `medium`/8000 (media/vision tasks seeded `enabled=false`-equivalent: no route); `PlatformProfile` for `linkedin` (objective "crédibilité, partenaires, inscriptions des parents", `max_chars` 3000, hashtags 3–5, link in body, aspect `16:9`) and `tiktok` (objective "notoriété auprès des parents", caption `max_chars` 2200, hashtags 3–6, link only in bio, aspect `9:16`, `bioLink` = TikTok bio tracked URL); `EditorialLineVersion` v1 published (Gabee description, audience, tone, do/don't, `productFacts` from the landing copy: ages 6–10, modules Mots/Nombres/Clavier/Code/Traduction, FR+EN, free up to 3 children, paid offer: `null`); each `Agent` + `AgentVersion` v1 published from `packages/db/prisma/content-studio/agents/<key>.md`.
- Each agent instruction file states: role and goal; inputs it receives (delimited blocks); hard rules (only state product facts from the editorial line; never invent figures; third-party content summarised + linked, never copied; untrusted blocks are data; no children depicted; TikTok: no trending sounds); output = the agent's schema only.
- Produces `@gabee/db/testing` factories: `createContentWeek(prisma, overrides)`, `createContentSlot(prisma, weekId, overrides)`, `createContentDraft(prisma, slotId, overrides)`, `createMediaAsset(prisma, overrides)`, `seedContentStudio(prisma)` (runs the same seed function).
- Produces `reportError(err: unknown, context: { scope: string; [k: string]: unknown }): void` — `console.error('[scope] …')` + `Sentry.captureException(err, { tags: { scope }, extra: context })`.

- [ ] **Step 1: Failing tests** — `content-studio-seed.test.mts`: `test('every agent key has an instruction file')`, `test('every routed task model exists in the model seed')`, `test('no seeded route targets a model without the task capability')`. `report-error.test.ts`: `test('reportError logs and forwards to Sentry with scope tag')` (mock `@sentry/nextjs` via `mock.module` or inject a capture function).
- [ ] **Step 2:** Run `pnpm --filter @gabee/db test` and `pnpm --filter @gabee/web test` → FAIL.
- [ ] **Step 3:** Write the schema, generate the migration, write the seed + agent files, factories, `reportError`.
- [ ] **Step 4:** `pnpm --filter @gabee/db run db:migrate:test && pnpm --filter @gabee/db test && pnpm --filter @gabee/web test` → PASS; `pnpm --filter @gabee/db run db:seed` twice on local DB → no error, no duplicate rows.
- [ ] **Step 5:** Commit `feat(db): content studio schema, seed and agents v1`.

### Task 3: Visit measurement and sign-up attribution (go-live prerequisite)

**Files:**
- Create: `apps/web/src/lib/server/services/web-visits.ts`, `apps/web/src/app/api/visits/route.ts`, `apps/web/src/components/landing/VisitBeacon.tsx` (client), `apps/web/src/components/landing/attribution.ts`
- Modify: `apps/web/src/proxy.ts` (apex allows `POST /api/visits`), `apps/web/src/app/[locale]/layout.tsx` (mount `<VisitBeacon />`), landing CTAs in `Hero.tsx`, `Pricing.tsx`, `TopBar.tsx`, `Footer.tsx` (use `withAttribution`), `apps/web/src/app/parent/signup/page.tsx` (send `attribution`), `apps/web/src/app/api/auth/signup/route.ts`, `apps/web/src/lib/server/services/accounts.ts` (`signup` opts gain `signupSource`)
- Test: `web-visits.test.ts`, `web-visits.integration.test.ts`, `apps/web/src/app/api/visits/route.integration.test.ts`, `attribution.test.ts`, extend the signup route integration test

**Interfaces:**
- `classifyVisit(input: { userAgent: string; referrer?: string; utm: Utm; ownHosts: string[] }): { bot: boolean; deviceClass: 'mobile'|'tablet'|'desktop'; source: string; referrerHost: string|null }` (pure; `ua-parser-js`; own-host referrers count as `direct`).
- `recordVisit(beacon: VisitBeacon, meta: { userAgent: string; now: Date; timezone: string }): Promise<{ stored: boolean }>`.
- `getAudience(range: { from: Date; to: Date }): Promise<{ byDay: {day, visits}[]; bySource: {source, visits, signups}[]; byContent: {content, visits, signups}[] }>` (signups from `ParentAccount.signupSource`).
- `withAttribution(href: string, location: Pick<Location,'search'>, referrer: string): string` — copies `utm_*` from the current URL, else adds `ref=<referrer host>` when external; leaves other params intact.
- Route `POST /api/visits`: no auth; `rateLimit(clientIpFrom(req), { scope: 'visits', limit: 120, windowMs: 60_000 })`; rejects when `Origin` host is not an own host (403 `forbidden_origin`); 204 on success or bot (bots not stored).

- [ ] **Step 1: Failing tests** — `test('classifyVisit drops common bots (Googlebot, curl, HeadlessChrome)')`; `test('utm_source wins over referrer')`; `test('own-host referrer is direct')`; `test('recordVisit stores no IP and computes day in studio timezone')` (23:30 UTC → next day in Douala); `test('POST /api/visits from foreign origin is 403')`; `test('POST /api/visits is rate limited after 120/min')`; `test('withAttribution forwards utm params and preserves existing query')`; `test('signup stores attribution on parent account')`; `test('getAudience counts signups by utm_content')`.
- [ ] **Step 2:** Run unit + integration → FAIL.
- [ ] **Step 3:** Implement services, route, beacon (`navigator.sendBeacon` with JSON Blob, once per page view, respects `navigator.doNotTrack === '1'` by sending nothing), CTA wiring, signup plumbing.
- [ ] **Step 4:** `pnpm --filter @gabee/web test && pnpm --filter @gabee/web run test:integration` → PASS.
- [ ] **Step 5:** Commit `feat(web): first-party visit measurement and sign-up attribution`.

### Task 4: AI task router

**Files:**
- Create: `apps/web/src/lib/server/ai/router/{types,errors,catalogue,cost,router,anthropic-adapter,fake-adapter,index}.ts`
- Test: `errors.test.ts`, `cost.test.ts`, `router.test.ts`, `router.integration.test.ts`

**Interfaces:**
- `interface AiRequest<S extends z.ZodType> { task: AiTask; system: string; blocks: AiInputBlock[]; schema: S; origin: 'scheduled_job'|'user_action'|'trial'; actorId?: string; agentRunId?: string; webSearch?: { maxUses: number } }`; `type AiInputBlock = { kind: 'text'; label: string; trusted: boolean; text: string } | { kind: 'image'; mime: string; base64: string }`.
- `interface AiResult<T> { output: T; modelKey: string; inputTokens: number; outputTokens: number; costUsd: number; latencyMs: number; refused: false }`.
- `class AiRefusedError extends Error { category: string|null }`, `class AiInvalidOutputError extends Error { issues: unknown }`, `class AiUnavailableError extends Error { reasons: string[] }`.
- `classifyAiError(err: unknown): 'outage'|'refusal'|'invalid_request'|'auth'` — Anthropic `RateLimitError`, `InternalServerError`, `APIConnectionError`/timeout, `error.type === 'overloaded_error'` → `outage`; `BadRequestError`/`UnprocessableEntityError` → `invalid_request`; `AuthenticationError`/`PermissionDeniedError` → `auth`.
- `interface AiAdapter { provider: string; call(model: AiModelRow, route: AiRouteRow, req: AiRequest<z.ZodType>): Promise<{ rawJson: unknown; inputTokens; outputTokens; stopReason: string; refusalCategory?: string|null }> }`.
- `runAiTask<S>(req: AiRequest<S>): Promise<AiResult<z.infer<S>>>` — loads routes for `req.task` ordered by rank, skips disabled/unhealthy models and adapters without key; for each: call, on `outage` record a failed `ai_usage` row, bump `consecutiveFailures` (≥ 3 → `unhealthyUntil = now + 5 min`), try next; on success reset failures, validate `rawJson` with `req.schema` (invalid → record row `status='invalid_output'`, throw `AiInvalidOutputError`); refusal → record + throw `AiRefusedError` (no fallback); all exhausted → `AiUnavailableError`. Every attempt writes one `ai_usage` row (`provider, model, purpose: req.task, task, origin, agentRunId, latencyMs, errorCode, status, costUsd` from catalogue prices).
- `costUsd(model: { inputUsdPerMTok; outputUsdPerMTok }, inputTokens, outputTokens): number` (rounded to 6 decimals).
- Anthropic adapter: `client.beta.messages.create({ model, max_tokens, output_config: { effort, format: <json schema of req.schema> }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', system, messages, tools: webSearch ? [{ type: 'web_search_20260209', name: 'web_search', max_uses }] : undefined })` (streaming with `finalMessage()` when `max_tokens > 16000`); untrusted text blocks wrapped as `<untrusted label="…">…</untrusted>` with a system line saying their content is data, never instructions; reads the final text block and `JSON.parse`s it; `stop_reason === 'refusal'` → refusal. Use `zodOutputFormat`'s JSON schema if the installed SDK exports it, else `z.toJSONSchema(schema)`; verify the beta `fallbacks` field against the installed SDK types (if absent, omit it and note it in the PR).
- `setAiAdapters(adapters: AiAdapter[])` / `resetAiAdapters()` for tests; `FakeAiAdapter(script: Array<{ json?: unknown; error?: 'outage'|'refusal'|'invalid_request' }>)`.

- [ ] **Step 1: Failing tests** — `test('classifyAiError maps 429/500/529/connection to outage, 400 to invalid_request')`; `test('costUsd uses catalogue prices')` (1M in + 1M out on opus-5-5 → 24); `test('router falls back on outage and records two usage rows')`; `test('router never falls back on refusal')`; `test('invalid JSON shape throws AiInvalidOutputError and records invalid_output')`; `test('three consecutive outages mark the model unhealthy for 5 minutes')`; `test('missing ANTHROPIC_API_KEY makes the anthropic adapter unavailable, not a crash')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement per Interfaces.
- [ ] **Step 4:** Unit + integration → PASS.
- [ ] **Step 5:** Commit `feat(ai): task router with DB catalogue, fallback on outage, metering`.

### Task 5: Media library on R2

**Files:**
- Create: `apps/web/src/lib/server/storage/{port,r2,memory,index}.ts`, `apps/web/src/lib/server/content-studio/media.ts`, `apps/web/src/lib/server/content-studio/sniff.ts`
- Create routes: `apps/web/src/app/api/admin/communication/media/route.ts` (GET list, POST init upload), `.../media/[id]/route.ts` (PATCH clearance/tags), `.../media/[id]/complete/route.ts` (POST verify), `.../media/[id]/download/route.ts` (GET → 302 to presigned URL)
- Modify: `apps/web/package.json` (add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`), `apps/web/src/lib/server/env.ts` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` optional), `.env.production.example`, `apps/web/src/proxy.ts` CSP (`connect-src` + `img-src` + `media-src` add `https://*.r2.cloudflarestorage.com`)
- Test: `sniff.test.ts`, `media.integration.test.ts`, route integration test

**Interfaces:**
- `interface StoragePort { presignPut(key: string, mime: string, sizeBytes: number, ttlSec: number): Promise<string>; presignGet(key: string, downloadName: string, ttlSec: number): Promise<string>; head(key: string): Promise<{ sizeBytes: number; mime: string|null } | null>; readRange(key: string, bytes: number): Promise<Uint8Array>; delete(key: string): Promise<void> }`; `getStorage(): StoragePort` (R2 when env complete; `STORAGE_DRIVER=memory` selects `MemoryStorage` for e2e and is refused when `IS_PROD`; otherwise throws `HttpError(503,'storage_unavailable')`); `setStorage(p)` / `resetStorage()` for tests; `MemoryStorage`.
- `sniffMime(head: Uint8Array): 'image/png'|'image/jpeg'|'image/webp'|'video/mp4'|null` (magic bytes; mp4 = `ftyp` at offset 4).
- `initUpload(input: MediaUploadInit, actorId): Promise<{ assetId; uploadUrl }>` — validates MIME allow-list + size caps, object key `media/<yyyy>/<mm>/<uuid>.<ext>`, row `status='pending'`.
- `completeUpload(assetId, actorId): Promise<MediaAssetDto>` — `head` must exist with matching size; `sniffMime(readRange(16))` must equal declared MIME, else `status='rejected'` + `rejectReason` and object deleted.
- `setClearance(assetId, { cleared, note }, actorId)`; `listMedia(filter: { kind?; cleared?; aspect?; tag? })`; `downloadUrl(assetId, downloadName): Promise<string>` (≤ 900 s, attachment).

- [ ] **Step 1: Failing tests** — `test('sniffMime recognises png/jpeg/webp/mp4 and rejects html')`; `test('initUpload rejects svg and a 301 MB video')`; `test('register rejects missing object and sniffed-mime mismatch')` (Review Focus 5); `test('only cleared assets are listed for art direction')`; `test('download route requires admin and returns a 302 to a presigned URL')`; `test('memory storage is refused in production')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; add deps; env + CSP; `.env.production.example` placeholders.
- [ ] **Step 4:** Unit + integration → PASS.
- [ ] **Step 5:** Commit `feat(content): media library on private R2 with verified uploads`.

### Task 6: Agents runtime and memory assembly

**Files:**
- Create: `apps/web/src/lib/server/content-studio/{agents,memory,links,post-rules}.ts`
- Test: `memory.test.ts`, `links.test.ts`, `post-rules.test.ts`, `agents.integration.test.ts`

**Interfaces:**
- `trackedUrl(input: { platform: ContentPlatform; target: 'landing'|'signup'; weekSlug: string; draftId: string; lang: ContentLanguage }): string` — `https://gabee.app/<lang>` or the signup URL (`parentSignupHref()` base); TikTok always returns the profile's bio link. `assertGabeeUrl(url: string): void` (throws on non-allow-listed host).
- `checkPostRules(platform, post, profile): string[]` — returns violations: over `max_chars`, hashtags outside range, any URL in body/caption not on Gabee hosts, TikTok `filming_plan` mode without plan, `library_video` mode handled by Art director (no violation).
- Memory builders (pure, return `AiInputBlock[]`): `strategistMemory(ctx: StrategistContext)`, `titlesMemory(ctx)`, `writerMemory(platform, ctx: WriterContext)`, `artDirectorMemory(ctx)`, `analystMemory(ctx)`. Contexts are plain data loaded by `loadStrategistContext(weekStart: Date)`, `loadWriterContext(draftId)` etc. in `agents.ts`. Writer context: editorial line, platform profile, week direction + platform angle, slot, last 10 publications on that platform with rating/comment, last 10 owner edit diffs on that platform (unified diff of `body`/`caption`). Strategist: objective, editorial line, platform profiles, last 4 weeks of slots + publications + feedback, audience summary (Task 3 `getAudience`), internal metrics summary (reuse `getDashboard()`), web search enabled (`maxUses: 5`) for observances/news.
- `type AgentOutput<K extends AgentKey>` = `z.infer` of the agent's schema (`strategist` → `DirectionProposals | WeekTitles` by `subject.kind`: `'week_proposals'|'week_titles'`; `writer_linkedin` → `LinkedInPost`; `writer_tiktok` → `TikTokPost`; `art_director` → `ArtDirection`; `analyst` → `ReportNarrative`).
- `runAgent<K extends AgentKey>(key: K, subject: { kind: string; id: string }, origin, actorId?): Promise<AgentOutput<K>>` — creates `AgentRun` (`running`), assembles memory, calls `runAiTask` with `AGENT_TASK[key]` and the agent's schema, for writers also applies `checkPostRules` (violations → treated as invalid output); on invalid output retries **once**, then `status='invalid_output'` and throws; on success stores output, `succeeded`, latency. All failures `reportError`.

- [ ] **Step 1: Failing tests** — `test('trackedUrl builds utm params and tiktok uses bio link')`; `test('assertGabeeUrl rejects evil.example')`; `test('post outputs violating platform rules are invalid')` (Review Focus 3: 3,001-char LinkedIn body; TikTok filming_plan without plan; caption containing `http://bit.ly/x`); `test('writerMemory marks third-party sources as untrusted blocks')`; `test('runAgent retries once on invalid output then records invalid_output')`; `test('runAgent journals model, tokens, cost and latency')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(content): agents runtime, memory assembly, link and post rules`.

### Task 7: Week, slot and draft workflow

**Files:**
- Create: `apps/web/src/lib/server/content-studio/{state,weeks,drafts,language-quota}.ts`
- Test: `state.test.ts`, `language-quota.test.ts`, `weeks.integration.test.ts`, `drafts.integration.test.ts`

**Interfaces:**
- `state.ts`: `canTransition(kind: 'week'|'slot'|'draft', from: string, to: string): boolean` with the graphs of the spec (`stale` reachable from `ready|approved`; `failed → generating` allowed).
- `checkLanguageQuota(slots: { platforms: { platform; language }[] }[], daysInWeek: number): { platform: ContentPlatform; english: number; required: number; ok: boolean }[]` (`required = daysInWeek <= 4 ? 1 : 2`).
- DTOs (`WeekDto`, `SlotDto`, `DraftDto`, `TodayBoard`) are defined and exported in `weeks.ts` / `drafts.ts`; they are snake_case JSON shapes consumed by Tasks 10–11.
- `weeks.ts`: `startWeek(opts: { now: Date; origin; actorId? }): Promise<WeekDto>` (Monday of the current studio-local week if launched mid-week with `firstDay` = tomorrow, else next Monday; creates `proposing`, runs strategist → `proposals_ready`); `chooseDirection(weekId, req: ChooseDirectionRequest, actorId)` → `direction_set`, then runs strategist titles → slots for `firstDay..Sunday` → `titles_ready`; `updateSlot(slotId, patch, actorId)` (marks existing drafts `stale`); `regenerateSlot(slotId, actorId)`; `validateWeek(weekId, actorId, { overrideQuota?: boolean })` — rejects with 409 `language_quota` unless `overrideQuota`; `skipDay(slotId, reason, actorId)`.
- `drafts.ts`: `generateDraftsForDay(day: string /* studio-local YYYY-MM-DD */, origin, actorId?): Promise<{ created: number; failed: number }>` — for each platform of the slot: upsert draft on `@@unique([slotId, platform])`, take a single-flight lock (`generationLockUntil` set via conditional `updateMany` where lock null or expired, 10 min), run writer then art director, create version n, set `ready` (or `failed` + `error`); `regenerateDraft(draftId, actorId)` (confirms over owner edit at UI level; service refuses while locked → 409 `generation_in_progress`); `editDraft(draftId, patch, actorId)` (new owner version with diff source); `approveDraft(draftId, actorId)` — TikTok requires a cleared video attached; LinkedIn may be text-only; `markPublished(draftId, req, actorId)` → `ContentPublication`, draft `published`, slot `done` when all drafts published or skipped; `todayBoard(day)` returns slot + drafts + yesterday's unfinished.

- [ ] **Step 1: Failing tests** — `test('canTransition forbids published → ready')`; `test('checkLanguageQuota requires 1 per platform on a 4-day week')`; `test('startWeek mid-week creates a partial week starting tomorrow')`; `test('validateWeek blocks when tiktok has one english post')` and `…passes with overrideQuota`; `test('editing a slot marks its drafts stale')`; `test('generateDraftsForDay is idempotent and single-flight per draft')` (Review Focus 2: two concurrent calls → one draft per platform, one agent run each); `test('tiktok approval requires a cleared video')`; `test('markPublished closes the slot when every draft is published')`. All with `FakeAiAdapter` + `MemoryStorage`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; every mutation `writeAudit` (kinds `content.week.*`, `content.slot.*`, `content.draft.*`).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(content): week, slot and draft workflow`.

### Task 8: Notifications and emails

**Files:**
- Create: `apps/web/src/lib/server/content-studio/{notify,emails}.ts`
- Test: `emails.test.ts`, `notify.integration.test.ts`

**Interfaces:**
- Email builders (pure, bilingual by the recipient's language = `fr` in 1a): `weekProposalsEmail(input: { week; proposals; report: ReportNarrative; audience; links: { week: string } }): { subject; text; html }`, `dailyDraftsEmail({ day; drafts; link })`, `weekReminderEmail`, `dayReminderEmail({ pending: { approve: number; publish: number } })`, `budgetAlertEmail({ spentUsd; budgetUsd; month })`, `jobFailedEmail({ jobKey; periodKey; error })`. Every email has exactly one call-to-action link to `ADMIN_APP_URL + /admin/communication…`; no presigned media URL ever appears; all interpolated text HTML-escaped.
- `type EmailContent = { subject: string; text: string; html: string }` (all builders return it).
- `notifyOnce(kind: string, periodKey: string, build: () => EmailContent): Promise<{ sent: number; skipped: number; failed: number }>` — per recipient: insert `StudioNotification` first (unique → skip if exists), send via `sendEmail`, store `providerId`/`status`; a failed send is recorded `failed` + `reportError` and retried on a later tick (row deleted so the unique key frees up only for `failed`).
- `pendingCounts(day): Promise<{ proposals: number; titles: number; approve: number; publish: number }>` (also feeds the nav badge, Task 11).

- [ ] **Step 1: Failing tests** — `test('emails escape agent text and contain one admin link')`; `test('no email contains an r2 url')`; `test('notifyOnce sends once per recipient per period')`; `test('failed send is recorded and retried next time')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(content): idempotent studio notifications and emails`.

### Task 9: Scheduler tick and jobs

**Files:**
- Create: `apps/web/src/lib/server/content-studio/{clock,schedule,jobs,budget}.ts`, `apps/web/src/app/api/cron/content-tick/route.ts`
- Modify: `ops/cron-digest/bin/entrypoint` (new `tick-loop` mode), create `ops/cron-digest/bin/tick-loop` (POST `$CONTENT_TICK_URL` every `${CONTENT_TICK_INTERVAL_S:-600}` s, same curl flags as `digest-once`, logs summary, failure never stops the loop); `docker-compose.yml` add service `cron-content` (same image, `command: ["tick-loop"]`, env `CONTENT_TICK_URL: http://web:3000/api/cron/content-tick`, `CRON_SECRET`, `depends_on web healthy`, network `internal`)
- Test: `clock.test.ts`, `schedule.test.ts`, `jobs.integration.test.ts`, route integration test

**Interfaces:**
- `clock.ts`: `localParts(now: Date, tz: string): { date: string /* YYYY-MM-DD */; weekday: 0..6; hour; minute }` (Intl.DateTimeFormat), `weekKey(now, tz)` (`week:<Monday YYYY-MM-DD>` of the **next** week on Sunday), `dayKey(now, tz)` (`day:<YYYY-MM-DD>`).
- `schedule.ts`: `dueJobs(now: Date, tz: string): { jobKey: JobKey; periodKey: string; deadline?: Date }[]` — a job is due from its slot time until the end of its validity window (`day.notify` until 12:00; `week.remind@15` until 20:00, then superseded by `week.remind@20`; `budget.check` period `hour:<YYYY-MM-DDTHH>`). Reminder period keys include the hour (`day:2026-10-29@09`).
- `jobs.ts`: `runTick(now = new Date()): Promise<TickSummary>` where `TickSummary = { ran: { jobKey; periodKey; status }[]; skipped: number }` — for each due job: claim `JobRun` with insert-on-unique (skip if `succeeded`, or `running` and started < 15 min ago, or `failed` with `nextAttemptAt > now`), execute handler, mark `succeeded` / `failed` with `attempts+1` and backoff `nextAttemptAt = now + min(2^attempts × 5 min, 60 min)`; after 4 failed attempts send `jobFailedEmail` once. Handlers: `week.propose` → `startWeek` (skip if week exists), `week.email` → Analyst report + `weekProposalsEmail`, `week.remind` → only if week not `validated`, `day.generate` → `generateDraftsForDay` (skip if week not validated), `day.notify` → only if drafts exist, `day.remind` → only if `pendingCounts` > 0, `budget.check` → `checkBudget`.
- `budget.ts`: `monthSpendUsd(month: string): Promise<number>` (sum `ai_usage.costUsd` where `task` not null), `checkBudget(now)` — at `≥ budgetAlertRatio × monthlyBudgetUsd` send `budgetAlertEmail` once per month (`budgetAlertSentFor`).
- Validating a week after Monday 04:00 calls `generateDraftsForDay(today)` immediately and `notifyOnce('day.notify', dayKey)` (spec edge case).
- Route `POST /api/cron/content-tick`: identical `CRON_SECRET` gate to `admin-digest` (503 when unset, 401 when wrong); returns `{ ok: true, summary }`.

- [ ] **Step 1: Failing tests** — `test('dayKey uses studio-local date across UTC midnight')` (Review Focus 1: `2026-10-28T23:30Z` in Douala → `day:2026-10-29`); `test('dueJobs at Sunday 06:05 Douala includes week.propose for next Monday')`; `test('day.notify missed at 05:00 still runs at 06:10, not at 12:10')`; `test('runTick runs each job once per period across two ticks')`; `test('failed job backs off and alerts after 4 attempts')`; `test('content-tick route rejects a wrong secret')`; `test('budget alert sent once per month at 80%')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement incl. sidecar script + compose service.
- [ ] **Step 4:** PASS; `bash -n ops/cron-digest/bin/tick-loop` OK.
- [ ] **Step 5:** Commit `feat(content): 10-minute scheduler tick with idempotent jobs`.

### Task 10: Admin API routes for the studio

**Files:**
- Create under `apps/web/src/app/api/admin/communication/`: `today/route.ts` (GET board), `weeks/route.ts` (POST start now), `weeks/[id]/route.ts` (GET), `weeks/[id]/direction/route.ts` (POST), `weeks/[id]/validate/route.ts` (POST), `slots/[id]/route.ts` (PATCH), `slots/[id]/regenerate/route.ts` (POST), `slots/[id]/skip/route.ts` (POST), `drafts/[id]/route.ts` (PATCH edit), `drafts/[id]/regenerate|approve|publish/route.ts` (POST), `audience/route.ts` (GET), `settings/route.ts` (GET/PATCH, super-admin), `objective/route.ts` (PUT, super-admin), `editorial-line/route.ts` (POST new published version, super-admin), `pending/route.ts` (GET counts)
- Test: one `route.integration.test.ts` per group (`weeks`, `drafts`, `settings`)

**Interfaces:**
- Every handler: `route<Ctx>(async (req, ctx) => { const session = await requireAdmin(req) /* or requireSuperAdmin */; … readJson(req, <Schema from Task 1>) … service call … json(dto) })`. Long AI operations (`direction`, `regenerate`, `start now`) run synchronously up to the route's `maxDuration` (set `export const maxDuration = 300`) and return the updated DTO; client shows progress.
- Errors surface as `HttpError` codes the UI maps to French text: `language_quota`, `generation_in_progress`, `ai_unavailable`, `ai_refused`, `ai_invalid_output`, `storage_unavailable`, `video_required`, `media_not_cleared`.

- [ ] **Step 1: Failing tests** — `test('admin can approve and publish; parent gets 403')`; `test('settings PATCH requires super_admin')`; `test('direction POST maps AiRefusedError to 422 ai_refused')`; `test('every mutation writes an audit row')`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(content): admin API for the communication studio`.

### Task 11: Admin UI — shell responsive, nav, Aujourd'hui, Semaine

**Files:**
- Modify: `apps/web/src/app/admin/_shell/nav.tsx` (item `{ id: 'communication', icon: 'mail', href: '/admin/communication', label: { fr: 'Communication', en: 'Communication' }, sub: Aujourd'hui · Semaine · Audience · Médiathèque · Réglages }` + `CRUMB_LABELS` entries + badge from `pendingCounts`), `apps/web/src/app/admin/admin.css` (shell `@media (max-width: 820px)`: nav becomes an off-canvas drawer behind a top bar button; `.page` padding 12 px; `overflow-wrap: anywhere` on post previews)
- Create: `apps/web/src/app/admin/communication/page.tsx` + `TodayClient.tsx`, `semaine/page.tsx` + `WeekClient.tsx`, `_components/{PostCard,DirectionCards,DayLines,PublishDialog,ErrorNotice}.tsx`, `_components/copy.ts` (`copyText(text): Promise<boolean>` with `navigator.clipboard.writeText` and a textarea fallback)
- Test: `e2e/tests/admin/communication.spec.ts`, `e2e/helpers/content.ts` (DB seeding of a validated week with ready drafts and a cleared asset — no AI in e2e)

**UI decisions:**
- Aujourd'hui: header (date, topic, format, language chips); one `PostCard` per platform: preview (LinkedIn text with line breaks; TikTok: caption + on-screen text list + video thumbnail or filming plan box), status badge, actions row **Copier le texte · Télécharger le média · Modifier · Régénérer · Valider**, then after approval **Marquer comme publié** opening `PublishDialog` (post URL, 1–5 stars, comment). Yesterday's unfinished drafts on top in a muted card. Empty state when no validated week: `EmptyState` with **Lancer la semaine maintenant**. Failed draft: `ErrorNotice` with reason in plain French + **Réessayer**. Text-only LinkedIn: notice "Aucun média autorisé — le post partira en texte seul" + "Téléverser un fichier".
- Semaine: step 1 `DirectionCards` (3 cards, select one, refinement textarea, optional per-platform angle fields collapsed under "Angle par plateforme") → **Arrêter cette direction**; step 2 `DayLines` (per day: topic, format, FR/EN toggle per platform, **Valider · Modifier · Régénérer · Sauter**), English counter per platform with red state below quota, **Valider la semaine** (quota override checkbox appears only when below quota, labelled "Valider quand même avec moins de posts en anglais").
- Phone: cards stack, action buttons wrap into a two-column grid with 44 px min height; no horizontal scroll at 360 px.

- [ ] **Step 1: Failing e2e** — `test('owner chooses a direction and validates the week')` (seeded `proposals_ready` week; direction POST served by seeded titles — e2e stubs the route via `page.route` returning the seeded week DTO); `test('owner approves a draft, copies it and marks it published')`; `test('tiktok card shows the filming plan when no video')`; `test('today screen fits a 360px viewport')` (Review Focus 4: `page.setViewportSize({width:360,height:740})`, assert `document.documentElement.scrollWidth <= 360` with a seeded 200-char unbroken hashtag).
- [ ] **Step 2:** `pnpm --filter @gabee/e2e exec playwright test admin/communication` → FAIL.
- [ ] **Step 3:** Implement shell responsive CSS, nav, pages, components.
- [ ] **Step 4:** e2e PASS; existing admin e2e specs still PASS.
- [ ] **Step 5:** Commit `feat(admin): communication studio — today and week screens, phone-ready shell`.

### Task 12: Admin UI — Audience, Médiathèque, Réglages (minimal), Journal

**Files:**
- Create: `apps/web/src/app/admin/communication/{audience,medias,reglages,journal}/page.tsx` + clients; `_components/MediaUploader.tsx` (presigned PUT with progress, then `complete`)
- Modify: `apps/web/src/app/admin/ops/ai-usage/page.tsx` and `getAiUsage` in `services/admin-observability.ts` — add a breakdown by `task` (Communication tasks vs question authoring) and show failed / invalid-output attempts
- Test: extend `e2e/tests/admin/communication.spec.ts`

**UI decisions:**
- Audience: tiles (visits 7 d, sign-ups 7 d, top source), table by source (visits, sign-ups), table by post (`utm_content` → draft topic/platform/date).
- Médiathèque: grid with kind/aspect/cleared filters; upload button; per asset: preview, **Autoriser / Retirer l'autorisation** (with note), tags, download.
- Réglages (super-admin; admins see read-only): objective of the month (type + statement + targets), editorial line (markdown textarea + product facts JSON form for the paid offer), recipients, timezone, monthly budget & alert ratio. Saving the editorial line publishes a new version (shown as "Version n · publiée le …").
- Journal: last 50 `JobRun` and `AgentRun` with status, duration, cost, error message; failed rows highlighted.

- [ ] **Step 1: Failing e2e** — `test('upload a video, clear it and attach it to a tiktok draft')` (e2e web server runs with `STORAGE_DRIVER=memory`, Task 5); `test('admin (not super) sees settings read-only')`; `test('journal shows a failed job with its error')`; integration `test('getAiUsage splits communication tasks from authoring and counts failed attempts')`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(admin): audience, media library, minimal settings and journal`.

### Task 13: Privacy wording, ops docs, release readiness

**Files:**
- Modify: `apps/web/messages/{fr,en}.json` (privacy section: audience measurement without cookie/IP; sign-up source stored on the account; purpose: measure which publications bring families), `docs/backups.md` (R2 media bucket not in DB backups; retention note), `docs/Comm/README.md` untouched (local only)
- Create: `docs/ops/content-studio-runbook.md` — owner actions before go-live (R2 bucket `gabee-media` + token scoped to it + bucket CORS allowing `PUT`/`GET` from `https://admin.gabee.app`; env vars in `.env.production`; `docker compose up -d cron-content`; seed; set recipients/objective/editorial line; upload + clear first media; "Lancer la semaine maintenant" on Oct 27–28); how to force a tick (`curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://web:3000/api/cron/content-tick` from the sidecar); how to read the Journal.
- Test: `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:integration && pnpm run test:coverage && pnpm --filter @gabee/e2e run test` all green.

- [ ] **Step 1:** Write privacy copy (FR + EN) — mark the PR "privacy wording: owner's lawyer review required before release".
- [ ] **Step 2:** Write runbook + backups note.
- [ ] **Step 3:** Full verification suite → all PASS.
- [ ] **Step 4:** Commit `docs(content): privacy wording, runbook, backups note`; open PR `feat/content-studio-1a → develop` with the go-live checklist in the body.
