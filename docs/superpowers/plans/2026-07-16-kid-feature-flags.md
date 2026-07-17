# Admin Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-controlled, per-parent-account feature-flag system whose first two flags gate the kid app's voiceover and ambient-music surfaces, so code can ship dark and be released globally or to specific families.

**Architecture:** A code-declared registry (`packages/types`) is the single source of flag keys + fallbacks. Two Prisma tables store the global default and per-parent overrides. The kid app fetches effective flags at launch + profile-select and caches them in its persisted store; gates read the cache with a code fallback when never fetched. Precedence is **override > enabledDefault > code fallback**. Admin manages flags through a server-rendered `/admin/flags` page; the parent/web app reads flags server-side through a shared helper.

**Tech Stack:** TypeScript, zod (`@gabee/types`), Prisma 7 (`@gabee/db`), Next.js App Router (`apps/web`), React 19 + zustand 5 persist (`apps/kid`), `node --import tsx --test` (unit/integration), Playwright (`e2e/`).

## Global Constraints

- **Flag registry is code, not data:** `FLAG_KEYS = ['kid_voiceover', 'kid_ambient_music']`. Adding/removing a key is a code change; a typo'd key is a compile error.
- **Code fallbacks (never-fetched device only):** `kid_voiceover: true`, `kid_ambient_music: false`.
- **Initial DB defaults (seeded once, create-only):** `kid_voiceover.enabledDefault: true`, `kid_ambient_music.enabledDefault: false`. Seed MUST NOT overwrite an admin-changed `enabledDefault` (upsert with empty `update`).
- **Precedence:** parent override > server `enabledDefault` > code fallback. `??` semantics only (an override of `false` is honored, not treated as absent).
- **Targeting granularity:** per **parent account** (whole family). No per-child targeting.
- **Prisma `@map`/`@@map`:** snake_case columns/tables (`enabled_default`, `flag_key`, `parent_id`, `feature_flags`, `feature_flag_overrides`).
- **Auth gating (this project's choice):** flag **reads** (GET list, GET overrides, kid effective) require an admin (`requireAdmin`) or kid device (`requireKidDevice`) respectively; flag **writes** (PATCH default, PUT/DELETE override) require `requireSuperAdmin` — same precedent as healthy-use + module-edit global controls. UI shows edit controls only when `session.role === 'super_admin'`.
- **Audit:** every write calls `writeAudit` with `targetKind: 'feature_flag'`, `targetId: <key>`, and `kind` ∈ `flag.update` / `flag.override_set` / `flag.override_remove` (dotted convention, matching existing `module.edit` / `user.role_change` kinds; these are authoritative over the spec's illustrative underscore names).
- **`kid_voiceover` OFF = the ENTIRE voice surface is dark** (kid + future parent-app voice UI). Today: `speak`/`speakSuccess` no-op. SFX/cues are UNAFFECTED by this flag.
- **`kid_ambient_music` OFF** = music never plays AND the "Musique d'ambiance" row is not rendered in kid Settings; the other sound settings (master switch) stay visible. The kid's own `music_enabled` pref is untouched — flag back ON restores their choice.
- **Offline-first, never throws:** flag fetches are best-effort; all errors swallowed. A flag flip is picked up at the next gate evaluation, no reload.
- **No `Co-Authored-By` trailer** on any commit.

---

### Task 1: Flag registry + contracts (`packages/types`)

**Files:**
- Create: `packages/types/src/flags.ts`
- Modify: `packages/types/src/index.ts` (add `export * from './flags';`)
- Test: `packages/types/test/contracts.test.ts` (append cases)

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `FLAG_KEYS: readonly ['kid_voiceover', 'kid_ambient_music']`
  - `type FlagKey = 'kid_voiceover' | 'kid_ambient_music'`
  - `FLAG_FALLBACKS: Record<FlagKey, boolean>`, `FLAG_DEFAULTS: Record<FlagKey, boolean>`, `FLAG_DESCRIPTIONS: Record<FlagKey, string>`
  - `FlagKeySchema` (`z.enum(FLAG_KEYS)`)
  - `EffectiveFlagsResponseSchema` / `EffectiveFlagsResponse` (`{ flags: Record<string, boolean> }`)
  - Admin contracts: `AdminFlagRowSchema`/`AdminFlagsListResponseSchema`/`AdminFlagsListResponse`, `UpdateFlagRequestSchema`/`UpdateFlagRequest`, `FlagOverrideRowSchema`/`FlagOverridesResponseSchema`/`FlagOverridesResponse`, `SetFlagOverrideRequestSchema`/`SetFlagOverrideRequest`, `DeleteFlagOverrideRequestSchema`/`DeleteFlagOverrideRequest`

**Note on test runner:** `packages/types` uses `node:test` via `tsx` (NOT Vitest — rolldown's native binding fails here). Test command below reflects that.

- [ ] **Step 1: Write the failing test**

Append to `packages/types/test/contracts.test.ts`. Add these imports to the existing top `import { ... } from '../src/index';` block:

```ts
  FLAG_KEYS,
  FLAG_FALLBACKS,
  FLAG_DEFAULTS,
  EffectiveFlagsResponseSchema,
  UpdateFlagRequestSchema,
  SetFlagOverrideRequestSchema,
```

Then append these cases at the end of the file:

```ts
describe('feature flags registry', () => {
  it('every key has a fallback, a default, and a description', () => {
    for (const key of FLAG_KEYS) {
      assert.equal(typeof FLAG_FALLBACKS[key], 'boolean');
      assert.equal(typeof FLAG_DEFAULTS[key], 'boolean');
    }
  });

  it('initial values match the design decisions', () => {
    assert.equal(FLAG_FALLBACKS.kid_voiceover, true);
    assert.equal(FLAG_FALLBACKS.kid_ambient_music, false);
    assert.equal(FLAG_DEFAULTS.kid_voiceover, true);
    assert.equal(FLAG_DEFAULTS.kid_ambient_music, false);
  });

  it('EffectiveFlagsResponseSchema accepts a boolean map', () => {
    const parsed = EffectiveFlagsResponseSchema.parse({ flags: { kid_voiceover: false, unknown_future: true } });
    assert.equal(parsed.flags.kid_voiceover, false);
  });

  it('UpdateFlagRequestSchema allows partial updates', () => {
    assert.deepEqual(UpdateFlagRequestSchema.parse({ enabled_default: true }), { enabled_default: true });
    assert.deepEqual(UpdateFlagRequestSchema.parse({}), {});
  });

  it('SetFlagOverrideRequestSchema requires a valid email + enabled', () => {
    assert.throws(() => SetFlagOverrideRequestSchema.parse({ email: 'nope', enabled: true }));
    const ok = SetFlagOverrideRequestSchema.parse({ email: 'a@b.com', enabled: false });
    assert.equal(ok.enabled, false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gabee/types test`
Expected: FAIL — `FLAG_KEYS` (and the other new imports) are not exported.

- [ ] **Step 3: Create the registry module**

Create `packages/types/src/flags.ts`:

```ts
import { z } from 'zod';

/**
 * Admin feature flags (design 2026-07-16). The set of known flags is CODE, not
 * data — a typo'd key is a compile error. Precedence at read time:
 * parent override > DB enabledDefault > code fallback (never-fetched only).
 */
export const FLAG_KEYS = ['kid_voiceover', 'kid_ambient_music'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

/** Code fallback when the device has NEVER fetched flags (offline-first). */
export const FLAG_FALLBACKS: Record<FlagKey, boolean> = {
  kid_voiceover: true, // live before flags existed — dark-launch OFF would regress
  kid_ambient_music: false, // ships dark; admin releases
};

/** Initial DB `enabledDefault`, seeded ONCE (create-only; admin edits thereafter). */
export const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  kid_voiceover: true,
  kid_ambient_music: false,
};

/** Seeded description; the admin UI can edit the stored copy. */
export const FLAG_DESCRIPTIONS: Record<FlagKey, string> = {
  kid_voiceover:
    "Voiceover / narration across the whole voice surface (kid app now; parent-app voice UI when it lands).",
  kid_ambient_music: 'Ambient background music on non-session kid screens.',
};

export const FlagKeySchema = z.enum(FLAG_KEYS);

/** Kid-facing effective flags. `record` (not the enum) so the server can send
 *  keys a client build doesn't know yet; the client filters to its registry. */
export const EffectiveFlagsResponseSchema = z.object({
  flags: z.record(z.string(), z.boolean()),
});
export type EffectiveFlagsResponse = z.infer<typeof EffectiveFlagsResponseSchema>;

// ── Admin contracts ──────────────────────────────────────────────────────────
export const AdminFlagRowSchema = z.object({
  key: z.string(),
  description: z.string(),
  enabled_default: z.boolean(),
  override_count: z.number().int().nonnegative(),
});
export type AdminFlagRow = z.infer<typeof AdminFlagRowSchema>;

export const AdminFlagsListResponseSchema = z.object({ flags: z.array(AdminFlagRowSchema) });
export type AdminFlagsListResponse = z.infer<typeof AdminFlagsListResponseSchema>;

export const UpdateFlagRequestSchema = z.object({
  enabled_default: z.boolean().optional(),
  description: z.string().max(200).optional(),
});
export type UpdateFlagRequest = z.infer<typeof UpdateFlagRequestSchema>;

export const FlagOverrideRowSchema = z.object({
  parent_id: z.string().uuid(),
  email: z.string(),
  enabled: z.boolean(),
});
export type FlagOverrideRow = z.infer<typeof FlagOverrideRowSchema>;

export const FlagOverridesResponseSchema = z.object({ overrides: z.array(FlagOverrideRowSchema) });
export type FlagOverridesResponse = z.infer<typeof FlagOverridesResponseSchema>;

export const SetFlagOverrideRequestSchema = z.object({
  email: z.string().email(),
  enabled: z.boolean(),
});
export type SetFlagOverrideRequest = z.infer<typeof SetFlagOverrideRequestSchema>;

export const DeleteFlagOverrideRequestSchema = z.object({
  email: z.string().email(),
});
export type DeleteFlagOverrideRequest = z.infer<typeof DeleteFlagOverrideRequestSchema>;
```

- [ ] **Step 4: Export the module**

In `packages/types/src/index.ts`, add after the existing `export * from './healthy-use';` line:

```ts
export * from './flags';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @gabee/types test`
Expected: PASS — all new cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/flags.ts packages/types/src/index.ts packages/types/test/contracts.test.ts
git commit -m "feat(types): feature-flag registry + kid/admin contracts"
```

---

### Task 2: Prisma tables + migration + seed (`packages/db`)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add two models + a back-relation on `ParentAccount`)
- Modify: `packages/db/prisma/seed.ts` (create-only upsert of registry rows)
- Create: migration under `packages/db/prisma/migrations/` (generated)

**Interfaces:**
- Consumes: `FLAG_KEYS`, `FLAG_DEFAULTS`, `FLAG_DESCRIPTIONS` (Task 1).
- Produces: Prisma models `FeatureFlag` (PK `key`) and `FeatureFlagOverride` (composite PK `[flagKey, parentId]`); the generated Prisma client used by all `apps/web` services.

**Environment note:** this worktree needs `packages/db/.env` present before Prisma commands work (see the worktree-setup memory). If `prisma generate`/`migrate` fails on a missing `DATABASE_URL`, copy it from the main checkout's `packages/db/.env` first, then re-run.

- [ ] **Step 1: Add the two models to the schema**

In `packages/db/prisma/schema.prisma`, add this block immediately AFTER the `model AuditLog { ... }` block (ends at the `@@map("audit_logs")` closing brace around line 577):

```prisma
// Admin feature flags (design 2026-07-16). `FeatureFlag` holds the global
// default per registry key; `FeatureFlagOverride` targets a specific parent
// account (whole family). Read precedence: override > enabledDefault > code
// fallback. Keys must be `@gabee/types` FLAG_KEYS members (app-enforced).
model FeatureFlag {
  key            String               @id
  enabledDefault Boolean              @map("enabled_default")
  description    String               @default("")
  updatedAt      DateTime             @updatedAt @map("updated_at")
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

- [ ] **Step 2: Add the back-relation on `ParentAccount`**

In `model ParentAccount { ... }`, add this line alongside the other relation fields (e.g. right after `familyActions          FamilyActivityLog[]` near line 181):

```prisma
  featureFlagOverrides FeatureFlagOverride[]
```

- [ ] **Step 3: Generate the migration + client**

Run:
```bash
pnpm --filter @gabee/db exec prisma migrate dev --name add_feature_flags
```
Expected: a new folder `packages/db/prisma/migrations/<timestamp>_add_feature_flags/migration.sql` is created containing `CREATE TABLE "feature_flags"` and `CREATE TABLE "feature_flag_overrides"`, the migration applies to the local `gabee` DB, and the Prisma client regenerates without error.

- [ ] **Step 4: Seed the registry rows (create-only)**

In `packages/db/prisma/seed.ts`, add to the top-of-file imports:

```ts
import { FLAG_KEYS, FLAG_DEFAULTS, FLAG_DESCRIPTIONS } from '@gabee/types';
```

Then, inside `async function main()`, add this block after the module/curriculum upserts (anywhere before `await prisma.$disconnect()`):

```ts
  // Feature flags (design 2026-07-16). CREATE-ONLY: an empty `update` means an
  // admin-changed enabledDefault is never clobbered by a re-seed; only missing
  // rows are inserted with their initial values.
  for (const key of FLAG_KEYS) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: {},
      create: { key, enabledDefault: FLAG_DEFAULTS[key], description: FLAG_DESCRIPTIONS[key] },
    });
  }
```

- [ ] **Step 5: Run the seed to verify it inserts the rows**

Run:
```bash
pnpm --filter @gabee/db exec tsx prisma/seed.ts
```
Expected: completes without error. Verify:
```bash
pnpm --filter @gabee/db exec prisma db execute --stdin <<'SQL'
SELECT key, enabled_default FROM feature_flags ORDER BY key;
SQL
```
Expected: two rows — `kid_ambient_music | f`, `kid_voiceover | t`.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/seed.ts packages/db/prisma/migrations
git commit -m "feat(db): feature_flags + feature_flag_overrides tables, create-only seed"
```

---

### Task 3: Server service — effective flags + admin operations (`apps/web`)

**Files:**
- Create: `apps/web/src/lib/server/services/feature-flags.ts`
- Test: `apps/web/src/lib/server/services/feature-flags.integration.test.ts`

**Interfaces:**
- Consumes: `FLAG_KEYS`, `FLAG_FALLBACKS`, `FLAG_DEFAULTS`, `FLAG_DESCRIPTIONS`, `FlagKey`, and the admin/response types (Task 1); `prisma` (`../db`), `HttpError` (`../http`); Prisma models (Task 2).
- Produces:
  - `getEffectiveFlagsForParent(parentId: string): Promise<Record<string, boolean>>`
  - `listFlagsForAdmin(): Promise<AdminFlagsListResponse>`
  - `updateFlagDefault(key: string, req: UpdateFlagRequest): Promise<void>`
  - `listFlagOverrides(key: string): Promise<FlagOverridesResponse>`
  - `setFlagOverride(key: string, req: SetFlagOverrideRequest): Promise<{ parentId: string }>`
  - `deleteFlagOverride(key: string, email: string): Promise<{ parentId: string }>`

**Integration-test note:** web service integration tests use `node:test` + `createTestClient`/`resetDb` from `@gabee/db/testing` and factories in `apps/web/src/test/`. For a test in `apps/web/src/lib/server/services/`, the path to `apps/web/src/test` is **three** `../` (`services → server → lib → src`), then `test/...` — i.e. `'../../../test/setup-integration'`. Verified against the sibling `progress.integration.test.ts` in the same directory.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/server/services/feature-flags.integration.test.ts`:

```ts
import '../../../test/setup-integration'; // services -> server -> lib -> src, then test
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../test/factories';
import {
  getEffectiveFlagsForParent,
  listFlagsForAdmin,
  updateFlagDefault,
  listFlagOverrides,
  setFlagOverride,
  deleteFlagOverride,
} from './feature-flags';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

test('never-fetched with no DB rows → code fallbacks', async () => {
  const { parent } = await createLoginableParent(prisma);
  const flags = await getEffectiveFlagsForParent(parent.id);
  assert.equal(flags.kid_voiceover, true); // FLAG_FALLBACKS
  assert.equal(flags.kid_ambient_music, false);
});

test('enabledDefault overrides the code fallback', async () => {
  const { parent } = await createLoginableParent(prisma);
  await prisma.featureFlag.create({ data: { key: 'kid_ambient_music', enabledDefault: true } });
  const flags = await getEffectiveFlagsForParent(parent.id);
  assert.equal(flags.kid_ambient_music, true);
});

test('a parent override beats the default (including a false override)', async () => {
  const { parent } = await createLoginableParent(prisma);
  await prisma.featureFlag.create({ data: { key: 'kid_voiceover', enabledDefault: true } });
  await setFlagOverride('kid_voiceover', { email: parent.email, enabled: false });
  const flags = await getEffectiveFlagsForParent(parent.id);
  assert.equal(flags.kid_voiceover, false);
});

test('listFlagsForAdmin returns every registry key with override counts', async () => {
  const { parent } = await createLoginableParent(prisma);
  await setFlagOverride('kid_ambient_music', { email: parent.email, enabled: true });
  const { flags } = await listFlagsForAdmin();
  assert.deepEqual(flags.map((f) => f.key).sort(), ['kid_ambient_music', 'kid_voiceover']);
  const music = flags.find((f) => f.key === 'kid_ambient_music')!;
  assert.equal(music.override_count, 1);
});

test('updateFlagDefault upserts and is create-safe', async () => {
  await updateFlagDefault('kid_voiceover', { enabled_default: false, description: 'x' });
  const { flags } = await listFlagsForAdmin();
  const vo = flags.find((f) => f.key === 'kid_voiceover')!;
  assert.equal(vo.enabled_default, false);
  assert.equal(vo.description, 'x');
});

test('setFlagOverride is idempotent; listFlagOverrides carries the email; delete removes it', async () => {
  const { parent } = await createLoginableParent(prisma);
  await setFlagOverride('kid_voiceover', { email: parent.email, enabled: false });
  await setFlagOverride('kid_voiceover', { email: parent.email, enabled: true }); // update, not dup
  const { overrides } = await listFlagOverrides('kid_voiceover');
  assert.equal(overrides.length, 1);
  assert.equal(overrides[0]!.email, parent.email);
  assert.equal(overrides[0]!.enabled, true);
  await deleteFlagOverride('kid_voiceover', parent.email);
  assert.equal((await listFlagOverrides('kid_voiceover')).overrides.length, 0);
});

test('unknown email → 404; unknown flag key → 404', async () => {
  await assert.rejects(() => setFlagOverride('kid_voiceover', { email: 'nobody@x.com', enabled: true }), /account_not_found/);
  const { parent } = await createLoginableParent(prisma);
  await assert.rejects(() => setFlagOverride('made_up_flag', { email: parent.email, enabled: true }), /unknown_flag/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gabee/web exec node --import tsx --test src/lib/server/services/feature-flags.integration.test.ts`
Expected: FAIL — `./feature-flags` module not found.

- [ ] **Step 3: Implement the service**

Create `apps/web/src/lib/server/services/feature-flags.ts`:

```ts
import {
  FLAG_KEYS,
  FLAG_FALLBACKS,
  FLAG_DEFAULTS,
  FLAG_DESCRIPTIONS,
  type FlagKey,
  type AdminFlagsListResponse,
  type UpdateFlagRequest,
  type FlagOverridesResponse,
  type SetFlagOverrideRequest,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';

/** Narrow an untrusted key to the registry, or 404. */
function assertKnownFlag(key: string): asserts key is FlagKey {
  if (!(FLAG_KEYS as readonly string[]).includes(key)) {
    throw new HttpError(404, 'unknown_flag', `Unknown flag "${key}"`);
  }
}

/** The FK on FeatureFlagOverride needs its FeatureFlag parent row to exist. */
async function ensureFlagRow(key: FlagKey): Promise<void> {
  await prisma.featureFlag.upsert({
    where: { key },
    update: {},
    create: { key, enabledDefault: FLAG_DEFAULTS[key], description: FLAG_DESCRIPTIONS[key] },
  });
}

/**
 * Effective boolean per registry key for one parent account:
 * override ?? enabledDefault ?? code fallback. Shared by the kid endpoint and
 * any server-side (parent-app/web) consumer — no HTTP hop needed server-side.
 */
export async function getEffectiveFlagsForParent(parentId: string): Promise<Record<string, boolean>> {
  const [defaults, overrides] = await Promise.all([
    prisma.featureFlag.findMany({ select: { key: true, enabledDefault: true } }),
    prisma.featureFlagOverride.findMany({ where: { parentId }, select: { flagKey: true, enabled: true } }),
  ]);
  const defaultByKey = new Map(defaults.map((d) => [d.key, d.enabledDefault]));
  const overrideByKey = new Map(overrides.map((o) => [o.flagKey, o.enabled]));
  const result: Record<string, boolean> = {};
  for (const key of FLAG_KEYS) {
    result[key] = overrideByKey.get(key) ?? defaultByKey.get(key) ?? FLAG_FALLBACKS[key];
  }
  return result;
}

/** Registry keys joined with DB rows + per-flag override counts (admin list). */
export async function listFlagsForAdmin(): Promise<AdminFlagsListResponse> {
  const [rows, counts] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.featureFlagOverride.groupBy({ by: ['flagKey'], _count: { flagKey: true } }),
  ]);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const countByKey = new Map(counts.map((c) => [c.flagKey, c._count.flagKey]));
  const flags = FLAG_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      description: row?.description ?? FLAG_DESCRIPTIONS[key],
      enabled_default: row?.enabledDefault ?? FLAG_DEFAULTS[key],
      override_count: countByKey.get(key) ?? 0,
    };
  });
  return { flags };
}

/** Upsert the global default (and/or description). Create-safe. */
export async function updateFlagDefault(key: string, req: UpdateFlagRequest): Promise<void> {
  assertKnownFlag(key);
  const update: { enabledDefault?: boolean; description?: string } = {};
  if (req.enabled_default !== undefined) update.enabledDefault = req.enabled_default;
  if (req.description !== undefined) update.description = req.description;
  await prisma.featureFlag.upsert({
    where: { key },
    update,
    create: {
      key,
      enabledDefault: req.enabled_default ?? FLAG_DEFAULTS[key],
      description: req.description ?? FLAG_DESCRIPTIONS[key],
    },
  });
}

/** Overrides for one flag, each joined to the target parent's email. */
export async function listFlagOverrides(key: string): Promise<FlagOverridesResponse> {
  assertKnownFlag(key);
  const rows = await prisma.featureFlagOverride.findMany({
    where: { flagKey: key },
    select: { parentId: true, enabled: true, parent: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return { overrides: rows.map((r) => ({ parent_id: r.parentId, email: r.parent.email, enabled: r.enabled })) };
}

/** Add/update an override by parent email. 404 if the email is unknown. */
export async function setFlagOverride(key: string, req: SetFlagOverrideRequest): Promise<{ parentId: string }> {
  assertKnownFlag(key);
  await ensureFlagRow(key);
  const parent = await prisma.parentAccount.findUnique({ where: { email: req.email }, select: { id: true } });
  if (!parent) throw new HttpError(404, 'account_not_found', `No account with email "${req.email}"`);
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_parentId: { flagKey: key, parentId: parent.id } },
    update: { enabled: req.enabled },
    create: { flagKey: key, parentId: parent.id, enabled: req.enabled },
  });
  return { parentId: parent.id };
}

/** Remove an override by parent email. 404 if the email is unknown. */
export async function deleteFlagOverride(key: string, email: string): Promise<{ parentId: string }> {
  assertKnownFlag(key);
  const parent = await prisma.parentAccount.findUnique({ where: { email }, select: { id: true } });
  if (!parent) throw new HttpError(404, 'account_not_found', `No account with email "${email}"`);
  await prisma.featureFlagOverride.deleteMany({ where: { flagKey: key, parentId: parent.id } });
  return { parentId: parent.id };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gabee/web exec node --import tsx --test src/lib/server/services/feature-flags.integration.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/services/feature-flags.ts apps/web/src/lib/server/services/feature-flags.integration.test.ts
git commit -m "feat(web): feature-flag service (effective merge + admin ops)"
```

---

### Task 4: Kid-facing route `GET /api/flags/effective` (`apps/web`)

**Files:**
- Create: `apps/web/src/app/api/flags/effective/route.ts`
- Test: `apps/web/src/app/api/flags/effective/route.integration.test.ts`

**Interfaces:**
- Consumes: `getEffectiveFlagsForParent` (Task 3); `route`/`json`/`requireKidDevice` (`@/lib/server/http`); `EffectiveFlagsResponseSchema` (Task 1); test helpers `parentToken`/`webRequest` (`apps/web/src/test/auth`).
- Produces: `GET` handler returning `{ flags: Record<string, boolean> }`.

**Route-test note:** for a route at `apps/web/src/app/api/flags/effective/`, the path to `apps/web/src/test` is **four** `../` (`effective → flags → api → app → src`, then `test`) — i.e. `'../../../../test/setup-integration'`. (For comparison, the deeper `api/admin/users/parents/route.integration.test.ts` uses five `../`.)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/api/flags/effective/route.integration.test.ts`:

```ts
import '../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../../test/factories';
import { parentToken, webRequest } from '../../../../test/auth';
import { GET } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const url = 'http://localhost/api/flags/effective';

test('no bearer → 401', async () => {
  const res = await GET(webRequest(url, { method: 'GET' }), undefined);
  assert.equal(res.status, 401);
});

test('paired parent → effective flags (code fallbacks with no DB rows)', async () => {
  const { parent } = await createLoginableParent(prisma);
  const token = await parentToken(parent.id, parent.email);
  const res = await GET(webRequest(url, { method: 'GET', bearer: token }), undefined);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.flags.kid_voiceover, true);
  assert.equal(body.flags.kid_ambient_music, false);
});
```

If `webRequest`'s option for a bearer token is named differently than `bearer` (check `apps/web/src/test/auth.ts` — the ambient-music/e2e code uses a `Bearer` header), use the correct option; the intent is "send `Authorization: Bearer <token>`".

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gabee/web exec node --import tsx --test src/app/api/flags/effective/route.integration.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/flags/effective/route.ts`:

```ts
import { EffectiveFlagsResponseSchema } from '@gabee/types';
import { route, json, requireKidDevice } from '@/lib/server/http';
import { getEffectiveFlagsForParent } from '@/lib/server/services/feature-flags';

export const runtime = 'nodejs';

/**
 * GET /api/flags/effective — the kid app reads this at launch + profile select.
 * Bearer identifies the parent account (same auth as every kid API). Targeting
 * is per account, so no per-profile parameter is needed.
 */
export const GET = route(async (req) => {
  const session = await requireKidDevice(req);
  const flags = await getEffectiveFlagsForParent(session.parentId);
  return json(EffectiveFlagsResponseSchema.parse({ flags }));
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gabee/web exec node --import tsx --test src/app/api/flags/effective/route.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/flags/effective/route.ts apps/web/src/app/api/flags/effective/route.integration.test.ts
git commit -m "feat(web): GET /api/flags/effective for the kid app"
```

---

### Task 5: Admin API routes + audit (`apps/web`)

**Files:**
- Create: `apps/web/src/app/api/admin/flags/route.ts` (GET list)
- Create: `apps/web/src/app/api/admin/flags/[key]/route.ts` (PATCH default)
- Create: `apps/web/src/app/api/admin/flags/[key]/overrides/route.ts` (GET / PUT / DELETE)
- Test: `apps/web/src/app/api/admin/flags/route.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 services; `route`/`json`/`readJson`/`requireAdmin`/`requireSuperAdmin` (`@/lib/server/http`); `writeAudit` (`@/lib/server/audit`); `UpdateFlagRequestSchema`/`SetFlagOverrideRequestSchema`/`DeleteFlagOverrideRequestSchema` (Task 1); test helpers `adminCookie`/`webRequest` and factory `createLoginableParent`.
- Produces: the four admin HTTP handlers consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/api/admin/flags/route.integration.test.ts`. This route directory (`api/admin/flags/`) is one level shallower than `api/admin/users/parents/`, so the path to `apps/web/src/test` is **four** `../` (`flags → admin → api → app → src`):

```ts
import '../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../../test/factories';
import { parentToken, webRequest, adminCookie } from '../../../../test/auth';
import { GET } from './route';
import { PATCH } from './[key]/route';
import { GET as OV_GET, PUT as OV_PUT, DELETE as OV_DELETE } from './[key]/overrides/route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const listUrl = 'http://localhost/api/admin/flags';
const keyCtx = (key: string) => ({ params: Promise.resolve({ key }) });

async function admin(role: 'admin' | 'super_admin') {
  const { parent } = await createLoginableParent(prisma, { role });
  const token = await parentToken(parent.id, parent.email);
  return { token, parent };
}

test('no session → 401; plain parent → 403', async () => {
  assert.equal((await GET(webRequest(listUrl, { method: 'GET' }), undefined)).status, 401);
  const { parent } = await createLoginableParent(prisma); // role: parent
  const token = await parentToken(parent.id, parent.email);
  const res = await GET(webRequest(listUrl, { method: 'GET', cookie: adminCookie(token) }), undefined);
  assert.equal(res.status, 403);
});

test('admin can list; only super_admin can PATCH a default', async () => {
  const { token: adminTok } = await admin('admin');
  const listed = await GET(webRequest(listUrl, { method: 'GET', cookie: adminCookie(adminTok) }), undefined);
  assert.equal(listed.status, 200);
  assert.ok((await listed.json()).flags.length === 2);

  // a plain admin cannot write
  const forbid = await PATCH(
    webRequest('http://localhost/api/admin/flags/kid_voiceover', { method: 'PATCH', cookie: adminCookie(adminTok), body: { enabled_default: false } }),
    keyCtx('kid_voiceover'),
  );
  assert.equal(forbid.status, 403);

  // super_admin can, and it writes an audit row
  const { token: superTok, parent: superParent } = await admin('super_admin');
  const ok = await PATCH(
    webRequest('http://localhost/api/admin/flags/kid_voiceover', { method: 'PATCH', cookie: adminCookie(superTok), body: { enabled_default: false } }),
    keyCtx('kid_voiceover'),
  );
  assert.equal(ok.status, 200);
  const flag = await prisma.featureFlag.findUnique({ where: { key: 'kid_voiceover' } });
  assert.equal(flag?.enabledDefault, false);
  const audit = await prisma.auditLog.findFirst({ where: { actorId: superParent.id, kind: 'flag.update' } });
  assert.ok(audit);
});

test('super_admin sets, lists, and removes an override by email', async () => {
  const { token: superTok } = await admin('super_admin');
  const { parent: target } = await createLoginableParent(prisma);
  const ovUrl = `http://localhost/api/admin/flags/kid_ambient_music/overrides`;

  const put = await OV_PUT(
    webRequest(ovUrl, { method: 'PUT', cookie: adminCookie(superTok), body: { email: target.email, enabled: true } }),
    keyCtx('kid_ambient_music'),
  );
  assert.equal(put.status, 200);

  const list = await OV_GET(webRequest(ovUrl, { method: 'GET', cookie: adminCookie(superTok) }), keyCtx('kid_ambient_music'));
  assert.equal((await list.json()).overrides[0].email, target.email);

  const del = await OV_DELETE(
    webRequest(ovUrl, { method: 'DELETE', cookie: adminCookie(superTok), body: { email: target.email } }),
    keyCtx('kid_ambient_music'),
  );
  assert.equal(del.status, 200);
  assert.equal((await OV_GET(webRequest(ovUrl, { method: 'GET', cookie: adminCookie(superTok) }), keyCtx('kid_ambient_music')).then((r) => r.json())).overrides.length, 0);
});
```

If `webRequest`'s body option is named differently (inspect `apps/web/src/test/auth.ts`), adapt — the intent is a JSON body + admin cookie.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gabee/web exec node --import tsx --test src/app/api/admin/flags/route.integration.test.ts`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement `GET /api/admin/flags`**

Create `apps/web/src/app/api/admin/flags/route.ts`:

```ts
import { route, json, requireAdmin } from '@/lib/server/http';
import { listFlagsForAdmin } from '@/lib/server/services/feature-flags';

export const runtime = 'nodejs';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await listFlagsForAdmin());
});
```

- [ ] **Step 4: Implement `PATCH /api/admin/flags/[key]`**

Create `apps/web/src/app/api/admin/flags/[key]/route.ts`:

```ts
import { UpdateFlagRequestSchema } from '@gabee/types';
import { route, json, readJson, requireSuperAdmin } from '@/lib/server/http';
import { updateFlagDefault } from '@/lib/server/services/feature-flags';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ key: string }> };

// Global default toggle (+ description): super_admin only (global release lever).
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { key } = await ctx.params;
  const patch = await readJson(req, UpdateFlagRequestSchema);
  await updateFlagDefault(key, patch);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'flag.update',
    targetKind: 'feature_flag',
    targetId: key,
    diff: patch,
  });
  return json({ ok: true });
});
```

- [ ] **Step 5: Implement the overrides route**

Create `apps/web/src/app/api/admin/flags/[key]/overrides/route.ts`:

```ts
import { SetFlagOverrideRequestSchema, DeleteFlagOverrideRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin, requireSuperAdmin } from '@/lib/server/http';
import { listFlagOverrides, setFlagOverride, deleteFlagOverride } from '@/lib/server/services/feature-flags';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ key: string }> };

// List overrides (with parent emails) — any admin may read.
export const GET = route<Ctx>(async (req, ctx) => {
  await requireAdmin(req);
  const { key } = await ctx.params;
  return json(await listFlagOverrides(key));
});

// Add/update an override by parent email — super_admin only.
export const PUT = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { key } = await ctx.params;
  const body = await readJson(req, SetFlagOverrideRequestSchema);
  const { parentId } = await setFlagOverride(key, body);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'flag.override_set',
    targetKind: 'feature_flag',
    targetId: key,
    diff: { email: body.email, enabled: body.enabled, parentId },
  });
  return json({ ok: true });
});

// Remove an override by parent email — super_admin only.
export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  const { key } = await ctx.params;
  const body = await readJson(req, DeleteFlagOverrideRequestSchema);
  const { parentId } = await deleteFlagOverride(key, body.email);
  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'flag.override_remove',
    targetKind: 'feature_flag',
    targetId: key,
    diff: { email: body.email, parentId },
  });
  return json({ ok: true });
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @gabee/web exec node --import tsx --test src/app/api/admin/flags/route.integration.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/admin/flags
git commit -m "feat(web): admin flag routes (list, default toggle, overrides) with audit"
```

---

### Task 6: Admin UI `/admin/flags` + nav entry (`apps/web`)

**Files:**
- Create: `apps/web/src/app/admin/flags/page.tsx` (server component)
- Create: `apps/web/src/app/admin/flags/FlagsClient.tsx` (client component)
- Modify: `apps/web/src/app/admin/_shell/nav.tsx` (nav entry + breadcrumb label)

**Interfaces:**
- Consumes: `requireAdminPage` (`@/lib/server/auth`), `listFlagsForAdmin` (Task 3), `PageHead` (`../_shell/primitives`), admin routes (Task 5); `AdminFlagsListResponse`/`FlagOverrideRow` types (Task 1).
- Produces: the `/admin/flags` page. No downstream consumers.

This task is UI-integration (multi-file, client/server split) — dispatch on a standard model.

- [ ] **Step 1: Add the nav entry + breadcrumb label**

In `apps/web/src/app/admin/_shell/nav.tsx`, add to the `NAV` array immediately after the `healthy-use` item (line ~24):

```tsx
  { id: 'flags', icon: 'tag', href: '/admin/flags', label: { fr: 'Fonctionnalités', en: 'Feature flags' } },
```

And add to the `CRUMB_LABELS` map:

```tsx
  flags: { fr: 'Fonctionnalités', en: 'Feature flags' },
```

(`'tag'` is an existing `AdminIconName` — verified in `_shell/icons.tsx`.)

- [ ] **Step 2: Create the server page**

Create `apps/web/src/app/admin/flags/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { listFlagsForAdmin } from '@/lib/server/services/feature-flags';
import { PageHead } from '../_shell/primitives';
import { FlagsClient } from './FlagsClient';

export const dynamic = 'force-dynamic';

// Admin feature flags (design 2026-07-16). Global default per flag + per-parent
// overrides. Release controls, not parental controls — parents never see them.
// Reads: any admin. Writes: super_admin only (canEdit).
export default async function FlagsPage() {
  const session = await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const { flags } = await listFlagsForAdmin();
  const canEdit = session.role === 'super_admin';

  return (
    <div className="page">
      <PageHead
        title={L ? 'Fonctionnalités' : 'Feature flags'}
        sub={
          L
            ? "Active ou coupe une fonctionnalité globalement, ou seulement pour certains comptes parents. Le code peut être livré puis activé ici."
            : 'Turn a feature on/off globally, or only for specific parent accounts. Code can ship dark and be released here.'
        }
      />
      <FlagsClient initial={flags} canEdit={canEdit} lang={lang} />
    </div>
  );
}
```

- [ ] **Step 3: Create the client component**

Create `apps/web/src/app/admin/flags/FlagsClient.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { AdminFlagRow, FlagOverrideRow, Language } from '@gabee/types';

export function FlagsClient({
  initial,
  canEdit,
  lang,
}: {
  initial: AdminFlagRow[];
  canEdit: boolean;
  lang: Language;
}) {
  const L = lang === 'fr';
  const [flags, setFlags] = useState<AdminFlagRow[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleDefault(row: AdminFlagRow) {
    if (!canEdit) return;
    setBusy(row.key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/flags/${row.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_default: !row.enabled_default }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setFlags((fs) => fs.map((f) => (f.key === row.key ? { ...f, enabled_default: !f.enabled_default } : f)));
    } catch {
      setError(L ? 'Échec de la mise à jour.' : 'Update failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card-grid">
      {error && <div className="alert error" role="alert">{error}</div>}
      {flags.map((f) => (
        <FlagCard
          key={f.key}
          row={f}
          canEdit={canEdit}
          busy={busy === f.key}
          lang={lang}
          onToggle={() => toggleDefault(f)}
          onOverrideCountChange={(n) =>
            setFlags((fs) => fs.map((x) => (x.key === f.key ? { ...x, override_count: n } : x)))
          }
        />
      ))}
    </div>
  );
}

function FlagCard({
  row,
  canEdit,
  busy,
  lang,
  onToggle,
  onOverrideCountChange,
}: {
  row: AdminFlagRow;
  canEdit: boolean;
  busy: boolean;
  lang: Language;
  onToggle: () => void;
  onOverrideCountChange: (n: number) => void;
}) {
  const L = lang === 'fr';
  const [open, setOpen] = useState(false);
  const [overrides, setOverrides] = useState<FlagOverrideRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);

  async function loadOverrides() {
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/flags/${row.key}/overrides`);
      if (!res.ok) throw new Error();
      const body = await res.json();
      setOverrides(body.overrides);
      onOverrideCountChange(body.overrides.length);
    } catch {
      setRowError(L ? 'Chargement impossible.' : 'Could not load overrides.');
    }
  }

  async function expand() {
    const next = !open;
    setOpen(next);
    if (next && overrides === null) await loadOverrides();
  }

  async function addOverride() {
    setRowBusy(true);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/flags/${row.key}/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), enabled }),
      });
      if (res.status === 404) throw new Error('unknown');
      if (!res.ok) throw new Error('fail');
      setEmail('');
      await loadOverrides();
    } catch (e) {
      setRowError(
        (e as Error).message === 'unknown'
          ? L ? "Aucun compte avec cet e-mail." : 'No account with that email.'
          : L ? 'Échec.' : 'Failed.',
      );
    } finally {
      setRowBusy(false);
    }
  }

  async function removeOverride(target: string) {
    setRowBusy(true);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/flags/${row.key}/overrides`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      if (!res.ok) throw new Error();
      await loadOverrides();
    } catch {
      setRowError(L ? 'Échec.' : 'Failed.');
    } finally {
      setRowBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontFamily: 'monospace' }}>{row.key}</strong>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>{row.description}</div>
        </div>
        <button
          type="button"
          className={'btn' + (row.enabled_default ? ' on' : '')}
          onClick={onToggle}
          disabled={!canEdit || busy}
          aria-pressed={row.enabled_default}
        >
          {row.enabled_default ? (L ? 'Activé par défaut' : 'On by default') : (L ? 'Coupé par défaut' : 'Off by default')}
        </button>
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="btn ghost" onClick={expand} aria-expanded={open}>
          {L ? 'Exceptions' : 'Overrides'} ({row.override_count})
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
          {rowError && <div className="alert error" role="alert" style={{ marginBottom: 8 }}>{rowError}</div>}
          {overrides === null ? (
            <div style={{ opacity: 0.6, fontSize: 13 }}>…</div>
          ) : overrides.length === 0 ? (
            <div style={{ opacity: 0.6, fontSize: 13 }}>{L ? 'Aucune exception.' : 'No overrides.'}</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {overrides.map((o) => (
                <li key={o.parent_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.email}</span>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>{o.enabled ? (L ? 'activé' : 'on') : (L ? 'coupé' : 'off')}</span>
                  {canEdit && (
                    <button type="button" className="btn ghost sm" onClick={() => removeOverride(o.email)} disabled={rowBusy}>
                      {L ? 'Retirer' : 'Remove'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="email"
                placeholder={L ? 'e-mail du parent' : 'parent email'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button type="button" className="btn ghost sm" onClick={() => setEnabled((v) => !v)} aria-pressed={enabled}>
                {enabled ? (L ? 'activé' : 'on') : (L ? 'coupé' : 'off')}
              </button>
              <button type="button" className="btn sm" onClick={addOverride} disabled={rowBusy || !email.trim()}>
                {L ? 'Ajouter' : 'Add'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

(Class names `card`, `card-grid`, `btn`, `btn ghost`, `alert error`, `on`, `sm` follow the existing `admin.css` vocabulary; if a helper class is absent the card still renders with inline styles — do not invent new global CSS.)

- [ ] **Step 3b: Verify the web app type-checks and builds**

Run: `pnpm --filter @gabee/web build`
Expected: build succeeds (no type errors in the new page/client). If `admin.css` lacks a class you referenced, the page still compiles — CSS is not type-checked.

- [ ] **Step 4: Manual smoke (documented, not automated here)**

Start the web dev server against the local `gabee` DB, sign in as a super_admin, open `/admin/flags`. Confirm: two cards render; toggling `kid_ambient_music`'s default persists on reload; expanding "Overrides" lists none; adding an unknown email surfaces the inline "No account with that email" error; adding a real parent email then reloading shows count 1. (This step is a checklist item — the e2e coverage in Task 9 is the automated guard.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/flags apps/web/src/app/admin/_shell/nav.tsx
git commit -m "feat(web): /admin/flags page — default toggles + per-parent overrides"
```

---

### Task 7: Kid consumption — store + `lib/flags.ts` + fetch wiring (`apps/kid`)

**Files:**
- Create: `apps/kid/src/lib/flags.ts`
- Create: `apps/kid/src/lib/flags.test.ts`
- Modify: `apps/kid/src/store.ts` (add `featureFlags` + `setFeatureFlags`, partialize, clearAuth wipe)
- Modify: `apps/kid/src/lib/api.ts` (add `getEffectiveFlags`)
- Modify: `apps/kid/src/main.tsx` (launch-time `refreshFlags()`)
- Modify: `apps/kid/src/App.tsx` (profile-select `refreshFlags()` + re-settle music)

**Interfaces:**
- Consumes: `FLAG_KEYS`, `FLAG_FALLBACKS`, `FlagKey`, `EffectiveFlagsResponseSchema`, `EffectiveFlagsResponse` (Task 1); `api` + `request` (`./api`); `useStore` (`../store`); `reevaluateMusic` (`./audio`).
- Produces:
  - `isFeatureEnabled(key: FlagKey): boolean`
  - `refreshFlags(): Promise<void>`
  - store field `featureFlags: Partial<Record<FlagKey, boolean>>` + action `setFeatureFlags(flags: Partial<Record<FlagKey, boolean>>): void`
  - `api.getEffectiveFlags(): Promise<EffectiveFlagsResponse>`

- [ ] **Step 1: Write the failing test**

Create `apps/kid/src/lib/flags.test.ts`:

```ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from '../store';
import { isFeatureEnabled } from './flags';

describe('isFeatureEnabled', () => {
  beforeEach(() => {
    useStore.setState({ featureFlags: {} });
  });

  it('falls back to the code default when never fetched', () => {
    assert.equal(isFeatureEnabled('kid_voiceover'), true);
    assert.equal(isFeatureEnabled('kid_ambient_music'), false);
  });

  it('reads a stored value, including a stored false', () => {
    useStore.setState({ featureFlags: { kid_voiceover: false, kid_ambient_music: true } });
    assert.equal(isFeatureEnabled('kid_voiceover'), false);
    assert.equal(isFeatureEnabled('kid_ambient_music'), true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/flags.test.ts`
Expected: FAIL — `./flags` and/or `featureFlags` state not present.

- [ ] **Step 3: Add `featureFlags` to the store**

In `apps/kid/src/store.ts`:

Add to the `AppState` interface (after `musicEnabled: boolean;`):

```ts
  /** Admin feature flags (design 2026-07-16). Device-level (per parent account,
   *  one device = one paired parent). Empty until first fetched → code fallback. */
  featureFlags: Partial<Record<import('@gabee/types').FlagKey, boolean>>;
```

Add the action to the interface (after `setMusicEnabled: (v: boolean) => void;`):

```ts
  setFeatureFlags: (flags: Partial<Record<import('@gabee/types').FlagKey, boolean>>) => void;
```

Add the initial value in the store body (after `musicEnabled: true,`):

```ts
      featureFlags: {},
```

Add the action implementation (after `setMusicEnabled: ...`):

```ts
      setFeatureFlags: (featureFlags) => set({ featureFlags }),
```

Add `featureFlags` to `partialize`:

```ts
      partialize: (s) => ({ lang: s.lang, token: s.token, parent: s.parent, needsDeviceLink: s.needsDeviceLink, deviceLinkSkipped: s.deviceLinkSkipped, audioEnabled: s.audioEnabled, musicEnabled: s.musicEnabled, featureFlags: s.featureFlags }),
```

Wipe it in `clearAuth` (flags belong to the account):

```ts
      clearAuth: () => {
        setApiToken(null);
        set({ token: null, parent: null, needsDeviceLink: false, deviceLinkSkipped: false, profile: null, play: null, featureFlags: {} });
      },
```

(Prefer a top-of-file `import type { ..., FlagKey } from '@gabee/types';` added to the existing type import rather than the inline `import('@gabee/types').FlagKey` shown above — use whichever the existing import style favors; the inline form is given so the field is unambiguous.)

- [ ] **Step 4: Add the api client method**

In `apps/kid/src/lib/api.ts`, add `EffectiveFlagsResponseSchema` and the `EffectiveFlagsResponse` type to the `@gabee/types` import block, then add this method to the `api` object (after `getEffectiveLimits`):

```ts
  /** Admin feature flags for the paired parent (design 2026-07-16). Best-effort;
   *  the caller (lib/flags.refreshFlags) swallows all errors. */
  async getEffectiveFlags(): Promise<EffectiveFlagsResponse> {
    return EffectiveFlagsResponseSchema.parse(await request('/api/flags/effective'));
  },
```

- [ ] **Step 5: Create `lib/flags.ts`**

Create `apps/kid/src/lib/flags.ts`:

```ts
// apps/kid/src/lib/flags.ts
// Offline-first feature-flag consumption (design 2026-07-16). Reads the
// persisted store; falls back to the code-declared default when never fetched.
// refreshFlags is best-effort — offline / unpaired failures are swallowed and
// the last-known values are kept.
import { FLAG_KEYS, FLAG_FALLBACKS, type FlagKey } from '@gabee/types';
import { useStore } from '../store';
import { api } from './api';

/** Live gate read: stored value if present, else the code fallback. */
export function isFeatureEnabled(key: FlagKey): boolean {
  return useStore.getState().featureFlags[key] ?? FLAG_FALLBACKS[key];
}

/**
 * Best-effort refresh. Filters the server response to keys this build knows
 * (forward-compat) and writes them to the store. Never throws.
 */
export async function refreshFlags(): Promise<void> {
  try {
    const res = await api.getEffectiveFlags();
    const known: Partial<Record<FlagKey, boolean>> = {};
    for (const key of FLAG_KEYS) {
      const v = res.flags[key];
      if (typeof v === 'boolean') known[key] = v;
    }
    useStore.getState().setFeatureFlags(known);
  } catch {
    /* offline / not paired — keep the last known values */
  }
}
```

- [ ] **Step 6: Wire the launch-time fetch**

In `apps/kid/src/main.tsx`, add an import near the other lib imports:

```ts
import { refreshFlags } from './lib/flags';
```

And add this call next to the existing launch sweep (after `void refreshIfNewer();`):

```ts
// Feature flags (design 2026-07-16) — best-effort, gated to the next evaluation.
void refreshFlags();
```

- [ ] **Step 7: Wire the profile-select fetch + music re-settle**

In `apps/kid/src/App.tsx`, add to the `./lib/flags` import (create it):

```ts
import { refreshFlags } from './lib/flags';
```

In `handlePick`, after the existing `reevaluateMusic();` line, add:

```ts
    // Keep flags fresh on a long-lived session; re-settle music once the
    // ambient-music flag may have changed (voiceover re-reads live on next speak).
    void refreshFlags().then(() => reevaluateMusic());
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/flags.test.ts`
Expected: PASS.

- [ ] **Step 9: Type-check the kid app**

Run: `pnpm --filter @gabee/kid exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/kid/src/lib/flags.ts apps/kid/src/lib/flags.test.ts apps/kid/src/store.ts apps/kid/src/lib/api.ts apps/kid/src/main.tsx apps/kid/src/App.tsx
git commit -m "feat(kid): offline-first feature-flag store + fetch at launch/profile-select"
```

---

### Task 8: Kid gates — voiceover + ambient music + Settings row (`apps/kid`)

**Files:**
- Modify: `apps/kid/src/lib/audio/index.ts` (voiceover flag gate)
- Modify: `apps/kid/src/lib/audio/music.ts` (ambient-music flag gate in `reevaluateMusic`)
- Modify: `apps/kid/src/screens/Settings.tsx` (hide the music row when the flag is off)
- Create: `apps/kid/src/lib/audio/flag-gates.dom.test.tsx`

**Interfaces:**
- Consumes: `isFeatureEnabled` (Task 7); existing `isEnabled`/`isMusicEnabled` (`./prefs`); `useStore` selector + `FLAG_FALLBACKS` in Settings.
- Produces: no new exports — behavior changes only.

**Design guard:** `shouldPlayMusic(zone, master, music)` stays a PURE 3-arg function (unit-tested elsewhere). The flag is consulted in `reevaluateMusic`'s inputs, NOT by changing that signature. The voiceover flag gates `speak`/`speakSuccess` ONLY — `sfx()` (cues) is untouched.

- [ ] **Step 1: Write the failing test**

Create `apps/kid/src/lib/audio/flag-gates.dom.test.tsx`:

```tsx
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from '../../store';

// The voice provider is constructed at module load in index.ts; we assert via
// the store-driven gate rather than the provider internals. speak() must no-op
// when the voiceover flag is off, even with the master switch on.
describe('voiceover flag gate', () => {
  beforeEach(() => {
    useStore.setState({ audioEnabled: true, musicEnabled: true, featureFlags: {} });
  });

  it('speak() is silenced when kid_voiceover is off', async () => {
    useStore.setState({ featureFlags: { kid_voiceover: false } });
    const { speak } = await import('./index');
    // No throw, no speech scheduled. We assert indirectly: with the flag off,
    // isFeatureEnabled('kid_voiceover') is false, so speak returns before touching
    // the provider. The guard is that calling it does not throw in a DOM-less env.
    assert.doesNotThrow(() => speak('bonjour', 'fr'));
  });

  it('music gate: reevaluateMusic does not start when kid_ambient_music is off', async () => {
    useStore.setState({ featureFlags: { kid_ambient_music: false } });
    const music = await import('./music');
    music.setMusicZone('ambient');
    // shouldPlayMusic is pure and still returns true for (ambient, true, true);
    // the flag short-circuit lives in reevaluateMusic, so no source is created.
    assert.equal(music.shouldPlayMusic('ambient', true, true), true);
    assert.doesNotThrow(() => music.reevaluateMusic());
  });
});
```

Note: this DOM test runs under the kid app's jsdom test env (same as `music.dom.test.tsx`). Match that file's env setup (it already configures jsdom via the kid test harness). If the kid DOM tests use a `// @vitest-environment` style pragma or a shared setup, mirror it exactly from `music.dom.test.tsx`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/audio/flag-gates.dom.test.tsx`
Expected: FAIL — the gate isn't wired yet, or (if it passes trivially) proceed; the substantive assertions land after Step 3–4 wiring. If it passes before wiring because the assertions are non-throw only, strengthen after wiring in Step 5.

- [ ] **Step 3: Gate voiceover in `lib/audio/index.ts`**

In `apps/kid/src/lib/audio/index.ts`, add the import near the top:

```ts
import { isFeatureEnabled } from '../flags';
```

Add a helper below the `provider` line:

```ts
/** Voiceover is on only when the master switch AND the admin flag both allow it. */
function voiceEnabled(): boolean {
  return isEnabled() && isFeatureEnabled('kid_voiceover');
}
```

In `speak`, replace `if (!isEnabled()) return;` with:

```ts
  if (!voiceEnabled()) return;
```

In `speakSuccess`, replace the leading `if (!isEnabled()) return;` with:

```ts
  if (!voiceEnabled()) return;
```

and inside its `setTimeout`, replace both `!isEnabled()` checks with `!voiceEnabled()`:

```ts
    if (provider.generation !== gen || !voiceEnabled()) return;
```
```ts
        if (provider.generation === gen && voiceEnabled()) return provider.speak(praise, praiseLang);
```

(`sfx()` keeps its `!isEnabled()` gate — cues are NOT flag-gated.)

- [ ] **Step 4: Gate ambient music in `music.ts`**

In `apps/kid/src/lib/audio/music.ts`, add the import at the top (after the existing `./prefs` import):

```ts
import { isFeatureEnabled } from '../flags';
```

Change `reevaluateMusic` to consult the flag (keep `shouldPlayMusic` pure):

```ts
/** Idempotent: reads flag × zone × prefs and settles playback to match. */
export function reevaluateMusic(): void {
  try {
    const flagOn = isFeatureEnabled('kid_ambient_music');
    if (flagOn && shouldPlayMusic(zone, isEnabled(), isMusicEnabled())) start();
    else stop();
  } catch {
    /* music must never break a render */
  }
}
```

- [ ] **Step 5: Hide the Settings music row when the flag is off**

In `apps/kid/src/screens/Settings.tsx`:

Add to imports:

```ts
import { FLAG_FALLBACKS } from '@gabee/types';
```

Add a reactive selector alongside the existing `musicEnabled` selector (line ~47):

```ts
  const musicFlag = useStore((s) => s.featureFlags.kid_ambient_music ?? FLAG_FALLBACKS.kid_ambient_music);
```

Wrap the "Musique d'ambiance" row (the `<div>` at line ~169 that contains `t('settings.musicTitle')` and the `toggleMusic` button) in a conditional so it is not rendered when the flag is off:

```tsx
            {musicFlag && (
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
            )}
```

(The master "Sons et voix" row above it is unchanged — only the music sub-row is conditional.)

- [ ] **Step 6: Run the gate test + the existing audio suites to verify green**

Run: `pnpm --filter @gabee/kid exec node --import tsx --test src/lib/audio/flag-gates.dom.test.tsx src/lib/audio/music.test.ts src/lib/audio/music.dom.test.tsx src/lib/audio/index.test.tsx`
Expected: PASS — new gate test green AND the pre-existing audio tests still pass (no regression to `shouldPlayMusic` purity or `sfx`/`speak` behavior with flags at their fallbacks).

- [ ] **Step 7: Type-check the kid app**

Run: `pnpm --filter @gabee/kid exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/kid/src/lib/audio/index.ts apps/kid/src/lib/audio/music.ts apps/kid/src/screens/Settings.tsx apps/kid/src/lib/audio/flag-gates.dom.test.tsx
git commit -m "feat(kid): gate voiceover + ambient music (and its Settings row) on admin flags"
```

---

### Task 9: End-to-end coverage (`e2e`)

**Files:**
- Create: `e2e/tests/kid-feature-flags.spec.ts`

**Interfaces:**
- Consumes: `FIXTURES` + `prisma` (`e2e/helpers/db.ts`); the running kid app + web API; the shared `AudioContext` instrumentation pattern from `kid-ambient-music.spec.ts`.
- Produces: nothing (terminal test).

**Test-DB note:** e2e runs against `gabee_test`; `e2e/helpers/db.ts` exposes a test-side `prisma`. Seed rows for `feature_flags` may or may not exist in the test DB — write the override rows the test needs directly and (where a default is asserted) upsert the `feature_flags` row too, so the test is self-contained. Use the FK-safe order: upsert `feature_flags` before inserting `feature_flag_overrides`.

- [ ] **Step 1: Write the spec**

Create `e2e/tests/kid-feature-flags.spec.ts`:

```ts
// e2e/tests/kid-feature-flags.spec.ts
// Admin feature flags gating the kid app. Reuses the ambient-music AudioContext
// instrumentation: music = looping AudioBufferSource; cues = OscillatorNodes.
// A per-parent override for kid_ambient_music flips whether music plays AND
// whether the Settings "Musique d'ambiance" row exists — cues stay regardless.
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, prisma } from '../helpers/db';

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
    Ctor.prototype.createOscillator = function () { window.__audioLog.oscillators++; return origOsc.call(this); };
  };
  wrap(window.AudioContext); wrap(window.webkitAudioContext);
`;

const liveMusic = async (page: Page) =>
  (await page.evaluate(() => window.__audioLog.music)).filter((m) => m.started && m.loop && !m.stopped).length;

async function setAmbientMusicOverride(enabled: boolean) {
  // FK-safe: the flag row must exist before an override references it.
  await prisma.featureFlag.upsert({
    where: { key: 'kid_ambient_music' },
    update: {},
    create: { key: 'kid_ambient_music', enabledDefault: false, description: '' },
  });
  const parent = await prisma.parentAccount.findUnique({ where: { email: FIXTURES.parentEmail }, select: { id: true } });
  if (!parent) throw new Error('fixture parent missing');
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_parentId: { flagKey: 'kid_ambient_music', parentId: parent.id } },
    update: { enabled },
    create: { flagKey: 'kid_ambient_music', parentId: parent.id, enabled },
  });
}

async function clearAmbientMusicOverride() {
  const parent = await prisma.parentAccount.findUnique({ where: { email: FIXTURES.parentEmail }, select: { id: true } });
  if (parent) {
    await prisma.featureFlagOverride.deleteMany({ where: { flagKey: 'kid_ambient_music', parentId: parent.id } });
  }
}

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

test.afterEach(async () => {
  await clearAmbientMusicOverride();
});

test('kid_ambient_music override ON → music plays and the Settings row is shown', async ({ page }) => {
  await setAmbientMusicOverride(true);
  await loginToHub(page);
  await page.mouse.click(1, 1); // autoplay-unlock gesture (see ambient-music spec)
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBeGreaterThan(0);

  // The Settings "Musique d'ambiance" sub-switch is present (flag ON).
  await page.getByRole('button', { name: `${FIXTURES.childName} settings` }).click();
  await expect(page.getByRole('button', { name: /Activée|Coupée/ })).toBeVisible();
});

test('kid_ambient_music override OFF → no music, Settings row hidden, cues still fire', async ({ page }) => {
  await setAmbientMusicOverride(false);
  await loginToHub(page);
  await page.mouse.click(1, 1);
  // Music must never start.
  await page.waitForTimeout(2000);
  expect(await liveMusic(page)).toBe(0);

  // The "Musique d'ambiance" sub-switch is NOT rendered (other sound settings stay).
  await page.getByRole('button', { name: `${FIXTURES.childName} settings` }).click();
  await expect(page.getByRole('button', { name: /Activés|Coupés/ })).toBeVisible(); // master row still there
  await expect(page.getByRole('button', { name: /Activée|Coupée/ })).toHaveCount(0); // music sub-row gone

  // Cues still fire: back to the hub, tap a BottomNav item → an oscillator.
  await page.getByRole('button', { name: 'Retour' }).click();
  const before = await page.evaluate(() => window.__audioLog.oscillators);
  await page.getByRole('button', { name: 'Apprendre' }).click();
  await expect.poll(() => page.evaluate(() => window.__audioLog.oscillators), { timeout: 10_000 }).toBeGreaterThan(before);
});
```

- [ ] **Step 2: Run the spec against the test DB**

Run (from repo root, with the e2e harness's usual web+kid servers on the `gabee_test` DB — see `e2e/playwright.config.ts` / `global-setup.ts`):

```bash
pnpm --filter @gabee/e2e exec playwright test tests/kid-feature-flags.spec.ts
```

Expected: both tests PASS. If the master-row accessible name differs (the master switch uses `settings.audioOn`/`audioOff` = 'Activés'/'Coupés'; the music sub-row uses 'Activée'/'Coupée' — note the singular vs plural agreement that discriminates them), adjust the name regexes to match `apps/kid/src/i18n.ts` exactly.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/kid-feature-flags.spec.ts
git commit -m "test(e2e): kid feature-flag gating for ambient music (on/off + cues)"
```

---

## Post-plan verification (run before the final whole-branch review)

- [ ] Full type-check + lint across touched packages:
  `pnpm --filter @gabee/types --filter @gabee/web --filter @gabee/kid exec tsc --noEmit` (per-package as configured) and the repo lint task.
- [ ] Types + web + kid unit/integration suites green (the glob-discovered `*.test.ts(x)` runs used above).
- [ ] `apps/web` build succeeds (`/admin/flags` compiles).
- [ ] e2e spec green against `gabee_test`.

## Notes for the executor

- Work ONLY in this worktree (`.claude/worktrees/kid-feature-flags`); never `cd` to the main checkout.
- The kid Vite build is CI-only locally — rely on `tsc --noEmit` + the node test runner for kid verification here, not a full `vite build`.
- If `webRequest`/`parentToken`/`adminCookie` option names in `apps/web/src/test/auth.ts` differ from what the test snippets assume (bearer vs header, body option name), adapt the test to the real helper signatures — the intent (auth header, JSON body, admin cookie) is what matters.
- The `../` depth on `setup-integration`/`factories`/`auth` imports must match each test file's actual directory depth to `apps/web/src/test`; verify against a sibling test in the same directory before running.
