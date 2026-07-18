# Admin Rollout & Invite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a super-admin enable one or more dark-launched features for a chosen set of parents and (optionally) send them a warm bilingual (FR+EN) invite email, while tracking per-parent who has been notified.

**Architecture:** Extend the existing feature-flag override system with a `notifiedAt` timestamp; add per-flag parent-facing copy to the type registry; a pure email-assembly function; one super-admin endpoint that loops parents×flags reusing `setFlagOverride`/`sendEmail`/`writeAudit`; and two UI surfaces (a Notified indicator on the existing Flags page, and a new `/admin/rollout` screen).

**Tech Stack:** Next.js (app router, RSC + client components), Prisma 7 (Postgres), Zod contracts in `@gabee/types`, `node:test` via tsx for tests.

## Global Constraints

- Node: keg-only `node@20` (≥20.19 for Prisma 7). Run pnpm from repo root.
- Tests: `packages/types` uses **`node:test` via tsx**, NOT Vitest. Web integration/unit tests also use `node:test` (`import 'node:test'`).
- Writes to flags/overrides are **super_admin only**; reads are any admin. Match existing `requireSuperAdmin` / `requireAdmin` usage.
- New env var `EMAIL_REPLY_TO` goes in the tracked `.env.production.example` only — never a real secret (per repo convention).
- Email greeting is a **fixed generic** "Bonjour ! / Hi there!" — there is no parent name field. Do NOT add a name token.
- Email is sent **one message per parent** — never a shared To/BCC list.
- French strings contain apostrophes — write them with **backtick template literals** to avoid escaping.
- Branch: `feat/admin-rollout-invite` (already created off `develop`). Commit after every task.

---

### Task 1: Registry — parent copy, announceable flags, and Zod contracts

**Files:**
- Modify: `packages/types/src/flags.ts`
- Test: `packages/types/test/contracts.test.ts`

**Interfaces:**
- Consumes: existing `FLAG_KEYS`, `FlagKey`, `FlagKeySchema`, `FlagOverrideRowSchema`.
- Produces:
  - `FlagAnnouncement = { fr: {title,body}, en: {title,body} }`
  - `FLAG_ANNOUNCEMENTS: Partial<Record<FlagKey, FlagAnnouncement>>`
  - `announceableFlags(): FlagKey[]`
  - `FlagOverrideRow` gains `notified_at: string | null`
  - `RolloutRequestSchema` / `RolloutRequest`, `RolloutResultSchema` / `RolloutResult`, `RolloutResponseSchema` / `RolloutResponse`

- [ ] **Step 1: Write the failing test**

Append to `packages/types/test/contracts.test.ts`:

```ts
import {
  FLAG_ANNOUNCEMENTS,
  announceableFlags,
  RolloutRequestSchema,
  FlagOverrideRowSchema,
} from '../src/flags.ts';

test('every announceable flag has FR+EN title and body', () => {
  for (const key of announceableFlags()) {
    const a = FLAG_ANNOUNCEMENTS[key]!;
    assert.ok(a.fr.title && a.fr.body, `${key} missing fr`);
    assert.ok(a.en.title && a.en.body, `${key} missing en`);
  }
});

test('the three dark flags are announceable', () => {
  const keys = announceableFlags();
  for (const k of ['code_draw_l4', 'code_l6', 'kid_ambient_music']) {
    assert.ok(keys.includes(k as never), `${k} should be announceable`);
  }
});

test('RolloutRequestSchema defaults enable/send to true and rejects non-announceable flags', () => {
  const ok = RolloutRequestSchema.parse({ flags: ['code_l6'], emails: ['a@b.co'] });
  assert.equal(ok.enable, true);
  assert.equal(ok.send, true);
  // kid_voiceover is a real flag but has no announcement copy
  const bad = RolloutRequestSchema.safeParse({ flags: ['kid_voiceover'], emails: ['a@b.co'] });
  assert.equal(bad.success, false);
});

test('FlagOverrideRow carries notified_at', () => {
  const row = FlagOverrideRowSchema.parse({
    parent_id: '11111111-1111-4111-8111-111111111111',
    email: 'a@b.co',
    enabled: true,
    notified_at: null,
  });
  assert.equal(row.notified_at, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gabee/types test`
Expected: FAIL — `FLAG_ANNOUNCEMENTS`/`announceableFlags`/`RolloutRequestSchema` not exported; `notified_at` unknown key.

- [ ] **Step 3: Implement in `packages/types/src/flags.ts`**

Add after `FLAG_DESCRIPTIONS` (use backticks for all copy):

```ts
export type FlagAnnouncement = {
  fr: { title: string; body: string };
  en: { title: string; body: string };
};

/** Parent-facing rollout copy (separate from the technical admin `description`).
 *  Only flags present here are "announceable" in the Rollout & Invite tool. */
export const FLAG_ANNOUNCEMENTS: Partial<Record<FlagKey, FlagAnnouncement>> = {
  code_draw_l4: {
    fr: {
      title: `🎨 Dessiner avec le code`,
      body: `Votre enfant peut désormais dessiner des images en programmant : en combinant des boucles et des conditions, il guide un crayon pour tracer des motifs. À retrouver dans le monde « Dessin » du module Code.`,
    },
    en: {
      title: `🎨 Drawing with code`,
      body: `Your child can now draw pictures by coding: by combining loops and conditions, they guide a pen to trace patterns. Find it in the "Draw" world of the Code module.`,
    },
  },
  code_l6: {
    fr: {
      title: `🐞 Chasser les bugs (Débogage)`,
      body: `Le débogage n'est pas un monde à part : c'est une nouvelle sorte d'exercice au niveau 6 des mondes Parcours et Actions. Votre enfant reçoit un programme déjà écrit mais qui bug, et doit trouver et corriger l'erreur. Pour l'essayer : Code → Parcours (ou Actions) → niveau 6 · Débogage. Les niveaux se débloquent dans l'ordre.`,
    },
    en: {
      title: `🐞 Bug hunting (Debugging)`,
      body: `Debugging isn't a separate world — it's a new type of exercise at level 6 of the Maze and Actions worlds. Your child gets a program that's already written but broken, and has to find and fix the mistake. To try it: Code → Maze (or Actions) → level 6 · Debugging. Levels unlock in order.`,
    },
  },
  kid_ambient_music: {
    fr: {
      title: `🎵 Une petite musique d'ambiance`,
      body: `Gabee se fait plus douillet : une musique de fond apaisante accompagne désormais les écrans d'accueil et de navigation. Elle se désactive à tout moment dans les Réglages.`,
    },
    en: {
      title: `🎵 A little background music`,
      body: `Gabee just got cozier: a gentle background soundtrack now plays on the home and menu screens. You can turn it off anytime in Settings.`,
    },
  },
};

export function announceableFlags(): FlagKey[] {
  return FLAG_KEYS.filter((k) => FLAG_ANNOUNCEMENTS[k] !== undefined);
}
```

Replace `FlagOverrideRowSchema` with the notified variant:

```ts
export const FlagOverrideRowSchema = z.object({
  parent_id: z.string().uuid(),
  email: z.string(),
  enabled: z.boolean(),
  notified_at: z.string().nullable(),
});
export type FlagOverrideRow = z.infer<typeof FlagOverrideRowSchema>;
```

Add the rollout contracts near the other admin contracts:

```ts
export const RolloutRequestSchema = z
  .object({
    flags: z.array(FlagKeySchema).min(1),
    emails: z.array(z.string().email()).min(1),
    enable: z.boolean().default(true),
    send: z.boolean().default(true),
    subject: z.string().optional(),
    text: z.string().optional(),
    html: z.string().optional(),
  })
  .refine((v) => v.flags.every((f) => FLAG_ANNOUNCEMENTS[f] !== undefined), {
    message: 'flags must all be announceable',
    path: ['flags'],
  });
export type RolloutRequest = z.infer<typeof RolloutRequestSchema>;

export const RolloutResultSchema = z.object({
  email: z.string(),
  enabled: z.boolean(),
  email_sent: z.boolean(),
  notified_at: z.string().nullable(),
  error: z.string().optional(),
});
export type RolloutResult = z.infer<typeof RolloutResultSchema>;

export const RolloutResponseSchema = z.object({
  results: z.array(RolloutResultSchema),
  summary: z.object({ enabled: z.number(), sent: z.number(), failed: z.number() }),
});
export type RolloutResponse = z.infer<typeof RolloutResponseSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gabee/types test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/flags.ts packages/types/test/contracts.test.ts
git commit -m "feat(types): flag announcements, announceableFlags, rollout contracts, override notified_at"
```

---

### Task 2: Prisma migration — `notifiedAt` on FeatureFlagOverride

**Files:**
- Modify: `packages/db/prisma/schema.prisma:613-623`
- Create: `packages/db/prisma/migrations/<timestamp>_feature_flag_override_notified_at/migration.sql` (generated)

**Interfaces:**
- Produces: `FeatureFlagOverride.notifiedAt: DateTime | null` (Prisma), column `notified_at` (Postgres). Consumed by Task 3.

- [ ] **Step 1: Edit the model**

In `packages/db/prisma/schema.prisma`, add the field to `model FeatureFlagOverride` (after `enabled`):

```prisma
model FeatureFlagOverride {
  flagKey    String        @map("flag_key")
  parentId   String        @map("parent_id") @db.Uuid
  enabled    Boolean
  notifiedAt DateTime?     @map("notified_at")
  createdAt  DateTime      @default(now()) @map("created_at")
  flag       FeatureFlag   @relation(fields: [flagKey], references: [key], onDelete: Cascade)
  parent     ParentAccount @relation(fields: [parentId], references: [id], onDelete: Cascade)

  @@id([flagKey, parentId])
  @@map("feature_flag_overrides")
}
```

- [ ] **Step 2: Generate + apply the migration (local DB)**

Run: `pnpm --filter @gabee/db exec prisma migrate dev --name feature_flag_override_notified_at`
Expected: a new migration folder is created, applied, and the Prisma client regenerates. The generated SQL should be a single `ALTER TABLE "feature_flag_overrides" ADD COLUMN "notified_at" TIMESTAMP(3);` (nullable, no backfill).

- [ ] **Step 3: Verify the column is nullable with no default**

Run: `pnpm --filter @gabee/db exec prisma migrate status`
Expected: "Database schema is up to date!" and the new migration listed as applied.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): add notified_at to feature_flag_overrides (nullable)"
```

---

### Task 3: Service — expose notified_at, plus notify helpers

**Files:**
- Modify: `apps/web/src/lib/server/services/feature-flags.ts`
- Test: `apps/web/src/lib/server/services/feature-flags.integration.test.ts`

**Interfaces:**
- Consumes: `prisma`, `FlagKey`, `assertKnownFlag` (existing, in-file).
- Produces:
  - `listFlagOverrides(key)` rows now include `notified_at: string | null`.
  - `getParentIdByEmail(email: string): Promise<string | null>`
  - `hasOverride(key: FlagKey, parentId: string): Promise<boolean>`
  - `markOverrideNotified(key: FlagKey, parentId: string, when: Date): Promise<void>`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/lib/server/services/feature-flags.integration.test.ts` (mirror the existing setup in that file — it already imports the test client and factories):

```ts
test('override rows expose notified_at; markOverrideNotified stamps it', async () => {
  const { parent } = await createLoginableParent(prisma);
  await setFlagOverride('code_l6', { email: parent.email, enabled: true });

  let listed = await listFlagOverrides('code_l6');
  assert.equal(listed.overrides[0].notified_at, null);

  const pid = await getParentIdByEmail(parent.email);
  assert.equal(pid, parent.id);
  assert.equal(await hasOverride('code_l6', parent.id), true);
  assert.equal(await hasOverride('code_draw_l4', parent.id), false);

  const when = new Date('2026-07-18T10:00:00.000Z');
  await markOverrideNotified('code_l6', parent.id, when);
  listed = await listFlagOverrides('code_l6');
  assert.equal(listed.overrides[0].notified_at, when.toISOString());
});
```

Ensure the file's import line pulls the new names:
```ts
import {
  listFlagOverrides, setFlagOverride, getParentIdByEmail, hasOverride, markOverrideNotified,
} from './feature-flags';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gabee/web exec node --import tsx --test --test-concurrency=1 src/lib/server/services/feature-flags.integration.test.ts`
Expected: FAIL — `getParentIdByEmail`/`hasOverride`/`markOverrideNotified` not exported; `notified_at` undefined.

- [ ] **Step 3: Implement in `feature-flags.ts`**

Update `listFlagOverrides` to select + map `notifiedAt`:

```ts
export async function listFlagOverrides(key: string): Promise<FlagOverridesResponse> {
  assertKnownFlag(key);
  const rows = await prisma.featureFlagOverride.findMany({
    where: { flagKey: key },
    select: { parentId: true, enabled: true, notifiedAt: true, parent: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return {
    overrides: rows.map((r) => ({
      parent_id: r.parentId,
      email: r.parent.email,
      enabled: r.enabled,
      notified_at: r.notifiedAt ? r.notifiedAt.toISOString() : null,
    })),
  };
}
```

Append the three helpers:

```ts
/** Resolve a parent id from email (null if unknown) — non-throwing, for batch loops. */
export async function getParentIdByEmail(email: string): Promise<string | null> {
  const p = await prisma.parentAccount.findUnique({ where: { email }, select: { id: true } });
  return p?.id ?? null;
}

/** True if a per-parent override row exists for this flag. */
export async function hasOverride(key: FlagKey, parentId: string): Promise<boolean> {
  const row = await prisma.featureFlagOverride.findUnique({
    where: { flagKey_parentId: { flagKey: key, parentId } },
    select: { flagKey: true },
  });
  return row !== null;
}

/** Stamp the notification time on an existing override (no-op if the row is missing). */
export async function markOverrideNotified(key: FlagKey, parentId: string, when: Date): Promise<void> {
  await prisma.featureFlagOverride.updateMany({
    where: { flagKey: key, parentId },
    data: { notifiedAt: when },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gabee/web exec node --import tsx --test --test-concurrency=1 src/lib/server/services/feature-flags.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/services/feature-flags.ts apps/web/src/lib/server/services/feature-flags.integration.test.ts
git commit -m "feat(web): notified_at in override list + notify helper services"
```

---

### Task 4: Pure email assembler

**Files:**
- Create: `apps/web/src/lib/server/rollout-email.ts`
- Test: `apps/web/src/lib/server/rollout-email.test.ts`

**Interfaces:**
- Consumes: `FLAG_KEYS`, `FLAG_ANNOUNCEMENTS`, `FlagKey` from `@gabee/types`.
- Produces: `assembleRolloutEmail(flags: FlagKey[]): { subject: string; text: string; html: string }`.

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleRolloutEmail } from './rollout-email';

test('single feature: FR and EN blocks both present', () => {
  const { subject, text, html } = assembleRolloutEmail(['code_l6']);
  assert.ok(subject.length > 0);
  assert.ok(text.includes('Débogage'));      // FR title
  assert.ok(text.includes('Debugging'));     // EN title
  assert.ok(html.includes('<'));             // some markup
});

test('multiple features render in FLAG_KEYS order, ignoring unknown/non-announceable', () => {
  const { text } = assembleRolloutEmail(['kid_ambient_music', 'code_draw_l4', 'kid_voiceover']);
  const drawIdx = text.indexOf('Dessiner');
  const musicIdx = text.indexOf(`musique d'ambiance`);
  assert.ok(drawIdx > -1 && musicIdx > -1);
  assert.ok(drawIdx < musicIdx, 'code_draw_l4 comes before kid_ambient_music (FLAG_KEYS order)');
  assert.ok(!text.includes('kid_voiceover')); // non-announceable dropped
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gabee/web exec node --import tsx --test src/lib/server/rollout-email.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/web/src/lib/server/rollout-email.ts`**

```ts
import { FLAG_KEYS, FLAG_ANNOUNCEMENTS, type FlagKey } from '@gabee/types';

const SUBJECT = `✨ De nouvelles aventures Gabee pour votre enfant / New Gabee adventures for your child`;

const INTRO_FR = `Bonjour ! Vous faites partie d'un petit groupe de familles que nous invitons à découvrir en avant-première les toutes dernières nouveautés de Gabee — avant tout le monde. Voici ce qui vient d'être activé sur le compte de votre enfant :`;
const INTRO_EN = `Hi there! You're part of a small group of families we're inviting to try Gabee's latest features before anyone else. Here's what we've just switched on for your child's account:`;
const OUTRO_FR = `Comme il s'agit d'un aperçu, votre avis compte énormément — répondez simplement à cet e-mail.\n\nÀ bientôt sur Gabee,\nL'équipe Gabee`;
const OUTRO_EN = `Because this is an early preview, your feedback means the world to us — just reply to this email.\n\nSee you on Gabee,\nThe Gabee Team`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function assembleRolloutEmail(flags: FlagKey[]): { subject: string; text: string; html: string } {
  const ordered = FLAG_KEYS.filter((k) => flags.includes(k) && FLAG_ANNOUNCEMENTS[k] !== undefined);

  const frBlocks = ordered.map((k) => {
    const a = FLAG_ANNOUNCEMENTS[k]!.fr;
    return `${a.title}\n${a.body}`;
  });
  const enBlocks = ordered.map((k) => {
    const a = FLAG_ANNOUNCEMENTS[k]!.en;
    return `${a.title}\n${a.body}`;
  });

  const text =
    `${INTRO_FR}\n\n${frBlocks.join('\n\n')}\n\n${OUTRO_FR}` +
    `\n\n⸻⸻⸻\n\n` +
    `${INTRO_EN}\n\n${enBlocks.join('\n\n')}\n\n${OUTRO_EN}`;

  const htmlBlocks = (blocks: FlagKey[], lang: 'fr' | 'en') =>
    blocks
      .map((k) => {
        const a = FLAG_ANNOUNCEMENTS[k]![lang];
        return `<p style="margin:16px 0"><strong>${esc(a.title)}</strong><br>${esc(a.body)}</p>`;
      })
      .join('');

  const html =
    `<div style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.5">` +
    `<p>${esc(INTRO_FR)}</p>${htmlBlocks(ordered, 'fr')}<p style="white-space:pre-line">${esc(OUTRO_FR)}</p>` +
    `<hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb">` +
    `<p>${esc(INTRO_EN)}</p>${htmlBlocks(ordered, 'en')}<p style="white-space:pre-line">${esc(OUTRO_EN)}</p>` +
    `</div>`;

  return { subject: SUBJECT, text, html };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gabee/web exec node --import tsx --test src/lib/server/rollout-email.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/rollout-email.ts apps/web/src/lib/server/rollout-email.test.ts
git commit -m "feat(web): pure bilingual rollout-email assembler"
```

---

### Task 5: Rollout API endpoint

**Files:**
- Create: `apps/web/src/app/api/admin/flags/rollout/route.ts`
- Test: `apps/web/src/app/api/admin/flags/rollout/route.integration.test.ts`
- Modify: `.env.production.example` (add `EMAIL_REPLY_TO`)

**Interfaces:**
- Consumes: `RolloutRequestSchema` (Task 1); `setFlagOverride`, `getParentIdByEmail`, `hasOverride`, `markOverrideNotified` (Task 3); `assembleRolloutEmail` (Task 4); `sendEmail` (`@/lib/server/email`); `route`,`json`,`readJson`,`requireSuperAdmin` (`@/lib/server/http`); `writeAudit` (`@/lib/server/audit`).
- Produces: `POST` handler returning `RolloutResponse`.

- [ ] **Step 1: Write the failing test**

```ts
// NOTE: rollout/ is one level deeper than flags/, so these test-helper imports use
// FIVE `../` segments (the flags tests use four). @/ aliases are unaffected.
import '../../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb } from '@gabee/db/testing';
import { createLoginableParent } from '../../../../../test/factories';
import { parentToken, webRequest, adminCookie } from '../../../../../test/auth';
import { setFlagOverride } from '@/lib/server/services/feature-flags';
import { POST } from './route';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const url = 'http://localhost/api/admin/flags/rollout';
async function superAdmin() {
  const { parent } = await createLoginableParent(prisma, { role: 'super_admin' });
  return { token: await parentToken(parent.id, parent.email), parent };
}

test('plain admin is forbidden', async () => {
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  const token = await parentToken(parent.id, parent.email);
  const res = await POST(webRequest(url, { method: 'POST', cookie: adminCookie(token),
    body: { flags: ['code_l6'], emails: ['x@y.co'] } }), undefined);
  assert.equal(res.status, 403);
});

test('enable-only leaves notified_at null; send stamps it + writes audit', async () => {
  const { token, parent: actor } = await superAdmin();
  const { parent: target } = await createLoginableParent(prisma);

  // enable only (send:false)
  let res = await POST(webRequest(url, { method: 'POST', cookie: adminCookie(token),
    body: { flags: ['code_l6'], emails: [target.email], send: false } }), undefined);
  assert.equal(res.status, 200);
  let ov = await prisma.featureFlagOverride.findFirst({ where: { flagKey: 'code_l6', parentId: target.id } });
  assert.equal(ov?.enabled, true);
  assert.equal(ov?.notifiedAt, null);

  // notify (send:true) — noop email provider returns ok
  res = await POST(webRequest(url, { method: 'POST', cookie: adminCookie(token),
    body: { flags: ['code_l6'], emails: [target.email], enable: false, send: true } }), undefined);
  const body = await res.json();
  assert.equal(body.summary.sent, 1);
  assert.equal(body.results[0].email_sent, true);
  ov = await prisma.featureFlagOverride.findFirst({ where: { flagKey: 'code_l6', parentId: target.id } });
  assert.ok(ov?.notifiedAt);
  const audit = await prisma.auditLog.findFirst({ where: { actorId: actor.id, kind: 'flag.rollout_notify' } });
  assert.ok(audit);
});

test('notify with no existing override → no_override_to_notify', async () => {
  const { token } = await superAdmin();
  const { parent: target } = await createLoginableParent(prisma);
  const res = await POST(webRequest(url, { method: 'POST', cookie: adminCookie(token),
    body: { flags: ['code_l6'], emails: [target.email], enable: false, send: true } }), undefined);
  const body = await res.json();
  assert.equal(body.results[0].error, 'no_override_to_notify');
  assert.equal(body.summary.failed, 1);
});

test('send failure is reported and does not stamp notified_at', async () => {
  const prev = process.env.EMAIL_PROVIDER;
  process.env.EMAIL_PROVIDER = 'resend'; // no RESEND_API_KEY → deterministic {ok:false}, no network
  try {
    const { token } = await superAdmin();
    const { parent: target } = await createLoginableParent(prisma);
    await setFlagOverride('code_l6', { email: target.email, enabled: true });
    const res = await POST(webRequest(url, { method: 'POST', cookie: adminCookie(token),
      body: { flags: ['code_l6'], emails: [target.email], enable: false, send: true } }), undefined);
    const body = await res.json();
    assert.equal(body.results[0].email_sent, false);
    assert.equal(body.summary.failed, 1);
    const ov = await prisma.featureFlagOverride.findFirst({ where: { flagKey: 'code_l6', parentId: target.id } });
    assert.equal(ov?.notifiedAt, null);
  } finally {
    if (prev === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = prev;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gabee/web exec node --import tsx --test --test-concurrency=1 src/app/api/admin/flags/rollout/route.integration.test.ts`
Expected: FAIL — `./route` has no `POST` export.

- [ ] **Step 3: Implement `apps/web/src/app/api/admin/flags/rollout/route.ts`**

```ts
import { RolloutRequestSchema, type FlagKey, type RolloutResult } from '@gabee/types';
import { route, json, readJson, requireSuperAdmin } from '@/lib/server/http';
import {
  setFlagOverride, getParentIdByEmail, hasOverride, markOverrideNotified,
} from '@/lib/server/services/feature-flags';
import { assembleRolloutEmail } from '@/lib/server/rollout-email';
import { sendEmail } from '@/lib/server/email';
import { writeAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const session = await requireSuperAdmin(req);
  const body = await readJson(req, RolloutRequestSchema);
  const flags = body.flags as FlagKey[];

  const assembled = assembleRolloutEmail(flags);
  const subject = body.subject ?? assembled.subject;
  const text = body.text ?? assembled.text;
  const html = body.html ?? assembled.html;
  const replyTo = process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || undefined;

  const results: RolloutResult[] = [];
  let enabled = 0, sent = 0, failed = 0;

  for (const email of body.emails) {
    const parentId = await getParentIdByEmail(email);
    if (!parentId) {
      results.push({ email, enabled: false, email_sent: false, notified_at: null, error: 'account_not_found' });
      failed++;
      continue;
    }

    let enabledHere = false;
    if (body.enable) {
      for (const key of flags) await setFlagOverride(key, { email, enabled: true });
      enabledHere = true;
      enabled++;
    }

    let emailSent = false;
    let notifiedAt: string | null = null;
    let error: string | undefined;

    if (body.send) {
      // Notification is only meaningful relative to a rollout: every flag must have an override.
      const missing = !body.enable && (await Promise.all(flags.map((k) => hasOverride(k, parentId)))).some((h) => !h);
      if (missing) {
        error = 'no_override_to_notify';
        failed++;
      } else {
        const r = await sendEmail({ to: email, subject, text, html, replyTo });
        if (r.ok) {
          const when = new Date();
          for (const key of flags) await markOverrideNotified(key, parentId, when);
          emailSent = true;
          notifiedAt = when.toISOString();
          sent++;
        } else {
          error = r.error ?? 'send_failed';
          failed++;
        }
      }
    }

    results.push({ email, enabled: enabledHere, email_sent: emailSent, notified_at: notifiedAt, error });
  }

  await writeAudit({
    actorId: session.parentId,
    actorRole: 'super_admin',
    kind: 'flag.rollout_notify',
    targetKind: 'feature_flag',
    targetId: flags.join(','),
    diff: { flags, parentCount: body.emails.length, enable: body.enable, send: body.send, sent, failed },
  });

  return json({ results, summary: { enabled, sent, failed } });
});
```

- [ ] **Step 4: Add the env var doc**

In `.env.production.example`, add near the other `EMAIL_*` entries:
```
# Reply-To for parent-facing emails (rollout invites, etc.). Falls back to EMAIL_FROM.
EMAIL_REPLY_TO=
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gabee/web exec node --import tsx --test --test-concurrency=1 src/app/api/admin/flags/rollout/route.integration.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/admin/flags/rollout .env.production.example
git commit -m "feat(web): POST /api/admin/flags/rollout — bulk enable + bilingual invite + notified stamping"
```

---

### Task 6: Flags page — Notified indicator on the overrides list

**Files:**
- Modify: `apps/web/src/app/admin/flags/FlagsClient.tsx:6-7` (types) and `:308-325` (override `<li>`)

**Interfaces:**
- Consumes: `FlagOverrideRow.notified_at` (Task 1) now returned by the overrides endpoint (Task 3).
- Produces: a visible "Notified {date}" / "not notified" label per override row.

- [ ] **Step 1: Render the notified state**

In `FlagsClient.tsx`, inside the override `<li>` (currently rendering email + Switch + Remove), add a status label between the email span and the Switch:

```tsx
<li key={o.parent_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{o.email}</span>
  <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
    {o.notified_at
      ? (L ? 'Averti le ' : 'Notified ') + new Date(o.notified_at).toLocaleDateString(L ? 'fr-FR' : 'en-GB')
      : (L ? 'non averti' : 'not notified')}
  </span>
  <Switch
    checked={o.enabled}
    disabled={!canEdit || rowBusy}
    onChange={(next) => putOverride(o.email, next)}
    ariaLabel={`${o.email} — ${row.key}`}
  />
  {canEdit && (
    <button type="button" className="btn ghost sm" onClick={() => removeOverride(o.email)} disabled={rowBusy}>
      {L ? 'Retirer' : 'Remove'}
    </button>
  )}
</li>
```

(The `FlagOverrideRow` type already carries `notified_at` from Task 1 — no local type change needed since the file imports it from `@gabee/types`.)

- [ ] **Step 2: Type-check + lint**

Run: `pnpm --filter @gabee/web typecheck && pnpm --filter @gabee/web lint`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run the app (`pnpm --filter @gabee/web dev`), open `/admin/flags` as super_admin, expand a flag's "Per parent account", add an override → it shows "not notified". (Full notified-state is exercised end-to-end in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/flags/FlagsClient.tsx
git commit -m "feat(web): show notified status per override on the Flags page"
```

---

### Task 7: Rollout & Invite screen + nav link

**Files:**
- Create: `apps/web/src/app/admin/rollout/page.tsx`
- Create: `apps/web/src/app/admin/rollout/RolloutClient.tsx`
- Modify: `apps/web/src/app/admin/_shell/nav.tsx:25` and `:210` (nav entry + label)

**Interfaces:**
- Consumes: `announceableFlags`, `FLAG_ANNOUNCEMENTS`, `assembleRolloutEmail`-shaped copy via the API; `POST /api/admin/flags/rollout` (Task 5); `GET /api/admin/users/parents`; `GET /api/admin/flags/{key}/overrides` (per selected flag, for status annotation).
- Produces: the rollout admin UI.

- [ ] **Step 1: Add the nav entry**

In `apps/web/src/app/admin/_shell/nav.tsx`, add after the `flags` item (line ~25):
```ts
{ id: 'rollout', icon: 'send', href: '/admin/rollout', label: { fr: 'Déploiement', en: 'Rollout' } },
```
And in the label map (line ~210):
```ts
rollout: { fr: 'Déploiement', en: 'Rollout' },
```
(If `'send'` is not a known icon key, reuse `'tag'` — the icon set is defined in the same file; pick an existing key.)

- [ ] **Step 2: Server page — `apps/web/src/app/admin/rollout/page.tsx`**

```tsx
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { announceableFlags, FLAG_ANNOUNCEMENTS } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { PageHead } from '../_shell/primitives';
import { RolloutClient } from './RolloutClient';

export const dynamic = 'force-dynamic';

export default async function RolloutPage() {
  const session = await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const canEdit = session.role === 'super_admin';
  const features = announceableFlags().map((key) => ({
    key,
    title: FLAG_ANNOUNCEMENTS[key]![lang].title,
  }));

  return (
    <div className="page">
      <PageHead
        title={L ? 'Déploiement & invitation' : 'Rollout & Invite'}
        sub={
          L
            ? 'Active une ou plusieurs fonctionnalités pour un groupe de parents, et invite-les (ou pas) par e-mail bilingue.'
            : 'Enable one or more features for a group of parents, and optionally invite them by bilingual email.'
        }
      />
      {!canEdit && (
        <div className="alert" role="note">
          {L ? 'Lecture seule — action réservée aux super-admins.' : 'Read-only — super_admin only.'}
        </div>
      )}
      <RolloutClient features={features} canEdit={canEdit} lang={lang} />
    </div>
  );
}
```

- [ ] **Step 3: Client — `apps/web/src/app/admin/rollout/RolloutClient.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FlagKey, Language, RolloutResponse } from '@gabee/types';

type Feature = { key: FlagKey; title: string };
type ParentRow = { email: string; children_count: number };
type Status = 'none' | 'enabled' | 'notified';

export function RolloutClient({
  features, canEdit, lang,
}: { features: Feature[]; canEdit: boolean; lang: Language }) {
  const L = lang === 'fr';
  const [picked, setPicked] = useState<Set<FlagKey>>(new Set());
  const [parents, setParents] = useState<ParentRow[]>([]);
  // per-flag override status: flagKey -> (email -> {enabled, notified_at})
  const [ovByFlag, setOvByFlag] = useState<Record<string, Record<string, { enabled: boolean; notified_at: string | null }>>>({});
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [enable, setEnable] = useState(true);
  const [send, setSend] = useState(true);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RolloutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/admin/users/parents')
      .then((r) => (r.ok ? r.json() : { parents: [] }))
      .then((b) => setParents((b.parents ?? []).map((p: ParentRow) => ({ email: p.email, children_count: p.children_count ?? 0 }))))
      .catch(() => {});
  }, []);

  // Load override status for each selected flag (for the per-parent annotation).
  useEffect(() => {
    for (const key of picked) {
      if (ovByFlag[key]) continue;
      void fetch(`/api/admin/flags/${key}/overrides`)
        .then((r) => (r.ok ? r.json() : { overrides: [] }))
        .then((b) => setOvByFlag((prev) => ({
          ...prev,
          [key]: Object.fromEntries((b.overrides ?? []).map((o: { email: string; enabled: boolean; notified_at: string | null }) => [o.email, { enabled: o.enabled, notified_at: o.notified_at }])),
        })))
        .catch(() => {});
    }
  }, [picked, ovByFlag]);

  // A parent's status across the selected flags: notified only if notified on ALL selected; enabled if enabled on ALL selected.
  function statusFor(email: string): Status {
    const keys = [...picked];
    if (keys.length === 0) return 'none';
    let allEnabled = true, allNotified = true;
    for (const k of keys) {
      const row = ovByFlag[k]?.[email];
      if (!row || !row.enabled) allEnabled = false;
      if (!row || !row.notified_at) allNotified = false;
    }
    return allNotified ? 'notified' : allEnabled ? 'enabled' : 'none';
  }

  const enabledNotNotified = useMemo(
    () => parents.filter((p) => statusFor(p.email) === 'enabled').map((p) => p.email),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parents, picked, ovByFlag],
  );

  async function submit() {
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/admin/flags/rollout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flags: [...picked],
          emails: [...chosen],
          enable, send,
          ...(subject.trim() ? { subject } : {}),
          ...(text.trim() ? { text } : {}),
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setResult(await res.json());
      // refresh status for the touched flags
      setOvByFlag({});
    } catch {
      setError(L ? 'Échec de l’envoi.' : 'Submit failed.');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = canEdit && picked.size > 0 && chosen.size > 0 && (enable || send) && !busy;

  return (
    <div className="card" style={{ padding: 16 }}>
      {error && <div className="alert error" role="alert">{error}</div>}

      <h3>{L ? '1 · Fonctionnalités' : '1 · Features'}</h3>
      <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
        {features.map((f) => (
          <label key={f.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={picked.has(f.key)} disabled={!canEdit}
              onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(f.key) : n.delete(f.key); return n; })} />
            {f.title} <span className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.key}</span>
          </label>
        ))}
      </div>

      <h3>{L ? '2 · Parents' : '2 · Parents'}</h3>
      <div style={{ marginBottom: 8 }}>
        <button type="button" className="btn ghost sm" disabled={!canEdit || enabledNotNotified.length === 0}
          onClick={() => setChosen(new Set(enabledNotNotified))}>
          {L ? 'Sélectionner : activés mais non avertis' : 'Select: enabled but not notified'} ({enabledNotNotified.length})
        </button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 4, maxHeight: 260, overflow: 'auto' }}>
        {parents.map((p) => {
          const st = statusFor(p.email);
          return (
            <li key={p.email} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={chosen.has(p.email)} disabled={!canEdit}
                onChange={(e) => setChosen((s) => { const n = new Set(s); e.target.checked ? n.add(p.email) : n.delete(p.email); return n; })} />
              <span style={{ flex: 1 }}>{p.email}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {st === 'notified' ? (L ? 'averti' : 'notified') : st === 'enabled' ? (L ? 'activé · non averti' : 'enabled · not notified') : (L ? 'non déployé' : 'not rolled out')}
              </span>
            </li>
          );
        })}
      </ul>

      <h3>{L ? '3 · E-mail (modifiable)' : '3 · Email (editable)'}</h3>
      <input type="text" value={subject} placeholder={L ? 'Objet (laisser vide = auto)' : 'Subject (blank = auto)'}
        onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', marginBottom: 8 }} disabled={!canEdit} />
      <textarea value={text} placeholder={L ? 'Corps (laisser vide = auto, bilingue)' : 'Body (blank = auto, bilingual)'}
        onChange={(e) => setText(e.target.value)} rows={8} style={{ width: '100%', marginBottom: 12 }} disabled={!canEdit} />

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <label><input type="checkbox" checked={enable} onChange={(e) => setEnable(e.target.checked)} disabled={!canEdit} /> {L ? 'Activer les fonctionnalités' : 'Enable features'}</label>
        <label><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} disabled={!canEdit} /> {L ? 'Envoyer l’invitation' : 'Send invite'}</label>
      </div>

      <button type="button" className="btn" onClick={submit} disabled={!canSubmit}>
        {busy ? '…' : L ? `Déployer pour ${chosen.size} parent(s)` : `Roll out to ${chosen.size} parent(s)`}
      </button>

      {result && (
        <div className="alert" role="status" style={{ marginTop: 16 }}>
          {L ? 'Activés' : 'Enabled'}: {result.summary.enabled} · {L ? 'Envoyés' : 'Sent'}: {result.summary.sent} · {L ? 'Échecs' : 'Failed'}: {result.summary.failed}
          {result.results.some((r) => r.error) && (
            <ul style={{ margin: '8px 0 0' }}>
              {result.results.filter((r) => r.error).map((r) => <li key={r.email}>{r.email} — {r.error}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check + lint**

Run: `pnpm --filter @gabee/web typecheck && pnpm --filter @gabee/web lint`
Expected: no errors.

- [ ] **Step 5: Manual end-to-end verification**

With `EMAIL_PROVIDER` unset (noop) and the app running, as super_admin:
1. `/admin/rollout` → pick "🐞 Bug hunting" + "🎨 Drawing with code".
2. Select a parent, keep both toggles on, submit → summary shows "Enabled: 1 · Sent: 1".
3. Server log shows a `[email:noop]` line.
4. Re-open the flag → the parent now reads "notified {today}" (Task 6 surface). On the rollout screen the same parent now shows "notified".
5. Uncheck "Send", enable a second parent → that parent shows "enabled · not notified"; the "enabled but not notified" quick-select picks them up.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/rollout apps/web/src/app/admin/_shell/nav.tsx
git commit -m "feat(web): Rollout & Invite admin screen + nav entry"
```

---

## Final verification

- [ ] `pnpm --filter @gabee/types test`
- [ ] `pnpm --filter @gabee/web test` (runs all unit tests, incl. `rollout-email`)
- [ ] `pnpm --filter @gabee/web test:integration` (runs all integration tests, incl. `feature-flags` + `flags/rollout`)
- [ ] `pnpm --filter @gabee/web typecheck && pnpm --filter @gabee/web lint`
- [ ] Manual walkthrough from Task 7 Step 5 passes.
- [ ] PR base = `develop` (gitflow); do not target `main`.
```
