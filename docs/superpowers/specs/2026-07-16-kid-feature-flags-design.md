# Gabee — Admin Feature Flags Design

**Status: APPROVED** · 2026-07-16
**Origin:** Valentine, during ambient-music QA: "même si on ship le code, on peut décider de le release ou pas. Ou juste release pour certains users."
**Grounded in:** the existing admin panel (`apps/web/src/app/admin/`), the `effective-limits` server-config pattern (`/api/profiles/[id]/effective-limits` + kid-side fetch-on-profile-select), the shipped audio engine (voiceover + ambient music, both on `main`).
**Branch:** `feat/kid-feature-flags` (based on `main` @ ce8c1a2, post ambient-music merge).

## Decisions (all resolved with Valentine, 2026-07-16)

| Decision | Choice |
|---|---|
| Scope | Generic-lite flag system (registry + defaults + per-account overrides), NOT a one-off voiceover switch. First flags: `kid_voiceover`, `kid_ambient_music` |
| Targeting | Per **parent account** — a flag applies to the whole family (all children, all their devices). No per-child targeting in v1 |
| Offline semantics | Values fetched online are cached in the persisted kid store; when never fetched, the flag's **code-declared fallback** applies. Admin changes take effect at the next online launch/profile select — no real-time push |
| Approach | A: dedicated tables + `/api/flags/effective` + `/admin/flags` page (the `effective-limits` pattern generalized). No external service |
| Initial flag values | `kid_voiceover`: server default ON, code fallback ON (already live in prod — no regression). `kid_ambient_music`: server default **OFF**, code fallback OFF (shipped dark; admin releases it) |

## 1. Registry — `packages/types`

The set of known flags is code, not data: a zod enum + per-flag metadata in `packages/types/src/flags.ts`:

```ts
export const FLAG_KEYS = ['kid_voiceover', 'kid_ambient_music'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];
/** Code fallback when the device has NEVER fetched flags (offline-first). */
export const FLAG_FALLBACKS: Record<FlagKey, boolean> = {
  kid_voiceover: true,       // live before flags existed — dark-launch OFF would regress
  kid_ambient_music: false,  // ships dark; admin releases
};
export const EffectiveFlagsResponseSchema = z.object({
  flags: z.record(z.string(), z.boolean()), // server may know flags this client build doesn't
});
```

Kid and web both import the registry — a typo'd key is a compile error. A flag key returned by the server but unknown to the client build is ignored (forward-compat); a registry key missing from the server response falls back.

## 2. Data model — `packages/db`

```prisma
model FeatureFlag {
  key            String   @id                       // must be a FLAG_KEYS member (app-enforced)
  enabledDefault Boolean  @map("enabled_default")
  description    String   @default("")
  updatedAt      DateTime @updatedAt @map("updated_at")
  overrides      FeatureFlagOverride[]
  @@map("feature_flags")
}

model FeatureFlagOverride {
  flagKey   String        @map("flag_key")
  parentId  String        @map("parent_id") @db.Uuid
  enabled   Boolean
  createdAt DateTime      @default(now()) @map("created_at")
  flag      FeatureFlag   @relation(fields: [flagKey], references: [key], onDelete: Cascade)
  parent    ParentAccount @relation(fields: [parentId], references: [id], onDelete: Cascade)
  @@id([flagKey, parentId])
  @@map("feature_flag_overrides")
}
```

Rows for the registry keys are seeded by `seed.ts` (upsert — never overwrite an admin-changed `enabledDefault`; upsert only creates missing rows with the initial values from the Decisions table). A registry key with no DB row resolves to its code fallback server-side too.

## 3. API — `apps/web`

- **Kid-facing:** `GET /api/flags/effective` — bearer identifies the parent (same auth as every kid API). Service: read all `feature_flags` + this parent's overrides → `{ flags: { key: override ?? enabledDefault } }`. Include registry keys missing from DB with their code fallback. No per-profile parameter needed (targeting is per account).
- **Admin:** under the existing admin auth/layout:
  - `GET /api/admin/flags` — registry keys joined with DB rows + override counts.
  - `PATCH /api/admin/flags/[key]` — update `enabledDefault` (and `description`).
  - `GET/PUT/DELETE /api/admin/flags/[key]/overrides` — list (with parent emails), add by parent **email** (resolve to id; 404 if unknown), remove.
  - Every mutation writes an `audit_logs` row (existing pattern: actor, action `feature_flag_updated` / `feature_flag_override_set` / `..._removed`, payload with key/old/new/target email).
- **Server-side consumption helper** (parent app & any web surface): `getEffectiveFlagsForParent(parentId)` in the web services layer — the same merge the kid endpoint uses, callable from server components/routes so parent-app pages can gate voice/music UI without an extra HTTP hop. Parent-facing surfaces never expose flags themselves; they just render or omit gated features.

## 4. Admin UI — `/admin/flags`

New entry in the admin nav. One card per registry flag: key, description (editable), the global default toggle, override count. Expanding a card shows the overrides editor: list (email · on/off · remove), add-row (email input + on/off + save). Server-rendered like sibling admin pages, minimal client JS, `admin.css` patterns. Errors surfaced inline (unknown email, network).

## 5. Kid app consumption — offline-first

- `apps/kid/src/lib/flags.ts`: `isFeatureEnabled(key: FlagKey): boolean` → persisted store value if present, else `FLAG_FALLBACKS[key]`. Plus `refreshFlags()`: best-effort `api.getEffectiveFlags()`, filters to known keys, writes to the store; all errors swallowed.
- Store: `featureFlags: Partial<Record<FlagKey, boolean>>` added to `partialize` (device-level, NOT per-profile — flags are per parent account, and one device = one paired parent).
- Fetch points: app launch (alongside the bundle-manifest sweep) and profile select (cheap, keeps a long-lived session fresh).
- **Gates:**
  - `kid_voiceover` OFF → the ENTIRE voice surface is dark (Valentine, 2026-07-16: "ça doit couvrir tout le voice, including parents app"): `speak`/`speakSuccess` no-op (checked inside `lib/audio/index.ts`, next to the existing `isEnabled()` gates), and any voice-related UI — current or future, kid app or parent app — is not rendered while the flag is off. Today no voice-specific UI exists on either surface (the master "Sons et voix" switch also governs SFX and stays); the binding rule is for what comes next (Phase D voice settings, per-profile voice choice): those surfaces MUST consult this same flag. SFX unaffected.
  - `kid_ambient_music` OFF → `shouldPlayMusic` short-circuits (flag consulted in `reevaluateMusic`'s inputs) AND the "Musique d'ambiance" row in kid Settings is not rendered (other sound settings stay visible). The kid's own `music_enabled` pref is untouched — flag back ON restores their choice.
- A flag flip picked up mid-session applies at the next gate evaluation (e.g. next `speak()` call / next `reevaluateMusic()`), no reload needed beyond the fetch points.

## 6. Semantics & edge cases

- Precedence: parent override > server `enabledDefault` > code fallback (never-fetched only).
- Unknown-to-client server keys: ignored. Unknown-to-server registry keys: fallback (server includes them from the registry anyway).
- Logout/re-pair to another parent: `clearAuth` clears `featureFlags` (they belong to the account).
- No real-time revocation: a family that goes permanently offline keeps the last fetched values — accepted (same class as the `audio_enabled` PATCH limitation).
- Flags are release controls, not parental controls: parents never see them; the kid Settings UI only ever hides/shows features.

## 7. Testing (three layers, same bar as ambient music)

1. **Unit:** types contracts (schemas, registry completeness); web service (merge precedence: override > default > fallback; unknown email 404; audit rows written) — integration tests against the test DB where the existing web patterns do so; kid `lib/flags.ts` (fallbacks, unknown-key filtering, precedence).
2. **DOM (kid):** voiceover gate (flag off → `speak` never reaches the provider; on → passes), music gate (flag off → no source even with prefs on; Settings row hidden), store persistence + clearAuth wipe.
3. **e2e (Playwright):** seed `kid_ambient_music` ON for the fixture parent via DB helper → music present; flip the override OFF in DB, relaunch (new page) → no music AND no Settings music row, while cues still play. Reuses the ambient-music spec's instrumentation.

## 8. Out of scope (v1)

- Percentage/gradual rollouts, per-child targeting, flag scheduling, real-time push, flag analytics/exposure events, non-boolean flags, kid-app UI for flags (invisible by design).
