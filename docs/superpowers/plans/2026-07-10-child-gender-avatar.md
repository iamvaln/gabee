# Child Gender + Girl Avatar Face Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a nullable `gender` (`girl`/`boy`) attribute to child profiles; render the girl avatar with a heart-shaped face contour (no lashes/brows); expose a "Genre" row in the parent avatar picker; provide a one-off prod backfill.

**Architecture:** `gender` follows exactly the same path as `hairStyle`: Prisma column → mappers (snake_case DTO) → API request schemas → parent forms → kid app sync. Rendering is a single new `FACE_PATHS: Record<Gender, string>` map in `@gabee/types` consumed by both avatar components; `null` renders identically to `'boy'` (the current face, byte-for-byte).

**Tech Stack:** Next.js (apps/web), Vite React PWA (apps/kid), Prisma 7 + Postgres, Zod v4 (`@gabee/types`), node:test via tsx for the types package.

**Spec:** `docs/superpowers/specs/2026-07-10-avatar-gender-design.md`

## Global Constraints

- Node is keg-only Homebrew node@20 (20.20.2); Prisma 7 needs ≥20.19. If `node` isn't on PATH, prefix commands with `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`.
- `packages/types` tests run with **node:test via tsx** (`pnpm --filter @gabee/types test`), NOT Vitest (rolldown native binding fails there).
- Local dev DB: Homebrew Postgres 14, database `gabee`, trust auth as `valentine` on :5432.
- Commit messages: conventional commits, **no Claude/Anthropic attribution trailers** (user preference).
- The boy/null face MUST stay byte-identical to the current face path: `M 32 46 Q 32 34 50 34 Q 68 34 68 46 Q 68 62 60 70 Q 50 77 40 70 Q 32 62 32 46 Z`.
- The girl face is contour-only. No eyelashes, no eyebrows, no blush, no gendered hairstyles (all rejected during design review).
- UI copy: Genre / Gender row label; option labels Garçon / Fille (fr), Boy / Girl (en).

---

### Task 1: `@gabee/types` — Gender enum, FACE_PATHS, DTO + API schemas

**Files:**
- Modify: `packages/types/src/enums.ts` (after `HairStyleSchema` ~line 150, and after `HAIR_STYLE_PATHS` ~line 227)
- Modify: `packages/types/src/progress.ts` (ChildProfileSchema, ~line 108)
- Modify: `packages/types/src/api/profiles.ts`
- Test: `packages/types/test/contracts.test.ts`

**Interfaces:**
- Consumes: existing `HairStyleSchema` / `HAIR_STYLE_PATHS` patterns.
- Produces (used by every later task):
  - `GenderSchema = z.enum(['girl', 'boy'])`, `type Gender = 'girl' | 'boy'`
  - `FACE_PATHS: Record<Gender, string>`
  - `ChildProfileSchema` gains `gender: GenderSchema.nullable().default(null)` → DTO field `gender: Gender | null`
  - `CreateProfileRequestSchema` gains `gender: GenderSchema.optional()`
  - `UpdateProfileRequestSchema` gains `gender: GenderSchema.nullable()` (inside the `.partial()` object, so wire shape is "omitted | 'girl' | 'boy' | null"; explicit null clears)

- [ ] **Step 1: Write the failing tests**

Append to `packages/types/test/contracts.test.ts`. Extend the existing import block from `'../src/index'` with `GenderSchema`, `FACE_PATHS`, `defaultProgressByModule`, `defaultProgressByModulePerLanguage` (keep already-imported names), then add:

```ts
describe('Gender', () => {
  it('GenderSchema accepts girl/boy and rejects anything else', () => {
    assert.equal(GenderSchema.parse('girl'), 'girl');
    assert.equal(GenderSchema.parse('boy'), 'boy');
    assert.throws(() => GenderSchema.parse('neutral'));
    assert.throws(() => GenderSchema.parse(''));
  });

  it('FACE_PATHS: one closed path per gender; boy keeps the legacy face verbatim', () => {
    assert.deepEqual(Object.keys(FACE_PATHS).sort(), ['boy', 'girl']);
    for (const p of Object.values(FACE_PATHS)) {
      assert.ok(p.startsWith('M ') && p.trim().endsWith('Z'));
    }
    // Regression pin: null/boy renders EXACTLY the current face (spec "Rendu SVG").
    assert.equal(
      FACE_PATHS.boy,
      'M 32 46 Q 32 34 50 34 Q 68 34 68 46 Q 68 62 60 70 Q 50 77 40 70 Q 32 62 32 46 Z',
    );
    assert.notEqual(FACE_PATHS.girl, FACE_PATHS.boy);
  });

  it('ChildProfile.gender defaults to null, accepts girl/boy', () => {
    const base = {
      id: UUID,
      parent_id: UUID2,
      name: 'Léna',
      skin_tone: 'skin_2',
      hair_color: 'hair_brown',
      hair_style: 'style_short',
      shirt_color: 'shirt_blue',
      language: 'fr',
      created_at: NOW,
      progress_by_module: defaultProgressByModule(),
      progress_by_module_per_language: defaultProgressByModulePerLanguage(),
    };
    assert.equal(ChildProfileSchema.parse(base).gender, null);
    assert.equal(ChildProfileSchema.parse({ ...base, gender: 'girl' }).gender, 'girl');
    assert.throws(() => ChildProfileSchema.parse({ ...base, gender: 'other' }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @gabee/types test`
Expected: FAIL — `GenderSchema`/`FACE_PATHS` are not exported (`SyntaxError` or undefined import).

- [ ] **Step 3: Implement in `enums.ts`**

Right after the `HairStyle` block (`export type HairStyle = z.infer<typeof HairStyleSchema>;`), add:

```ts
/** Child gender — an attribute of the PROFILE (not just the avatar): it picks
 *  the avatar face contour today and will drive French grammatical agreement
 *  later. Nullable everywhere; null renders identically to 'boy'. */
export const GenderSchema = z.enum(['girl', 'boy']);
export type Gender = z.infer<typeof GenderSchema>;
```

Right after the `HAIR_STYLE_PATHS` map (before `AVATAR_BG`), add:

```ts
/** Face contour per gender, 100×100 viewBox — same single-source pattern as
 *  HAIR_STYLE_PATHS. `boy` is the historical face, unchanged; `girl` is the
 *  "heart" contour validated in design review (full cheeks at eye level,
 *  gently tapering chin). Features (eyes/nose/smile/ears) are shared and NOT
 *  gendered. Renderers do FACE_PATHS[gender ?? 'boy'].
 */
export const FACE_PATHS: Record<Gender, string> = {
  boy: 'M 32 46 Q 32 34 50 34 Q 68 34 68 46 Q 68 62 60 70 Q 50 77 40 70 Q 32 62 32 46 Z',
  girl: 'M 31 46 Q 31 34 50 34 Q 69 34 69 46 Q 69 57 60 65 Q 50 76 40 65 Q 31 57 31 46 Z',
};
```

- [ ] **Step 4: Implement in `progress.ts`**

Add `GenderSchema` to the existing `./enums` import in `progress.ts`, then in `ChildProfileSchema` insert directly after the `shirt_color` line:

```ts
  /** Chosen by the parent; null = unspecified → renders as the boy face. */
  gender: GenderSchema.nullable().default(null),
```

- [ ] **Step 5: Implement in `api/profiles.ts`**

Extend the enums import: `import { GenderSchema, HairColorSchema, ... } from '../enums';`

In `CreateProfileRequestSchema`, after `shirt_color`:

```ts
  gender: GenderSchema.optional(),
```

In `UpdateProfileRequestSchema`'s object (before `.partial()`), after `shirt_color`:

```ts
    /** Nullable so an explicit null CLEARS the gender back to unspecified. */
    gender: GenderSchema.nullable(),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @gabee/types test`
Expected: PASS (all suites, including pre-existing ones — the new DTO field has a default so old samples still parse).

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/enums.ts packages/types/src/progress.ts packages/types/src/api/profiles.ts packages/types/test/contracts.test.ts
git commit -m "feat(types): child gender enum + per-gender avatar face paths"
```

---

### Task 2: Prisma — `Gender` enum + `ChildProfile.gender` column

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (enum after `HairStyle` ~line 64; field in `model ChildProfile` ~line 300)
- Create (generated): `packages/db/prisma/migrations/<timestamp>_child_gender/migration.sql`

**Interfaces:**
- Consumes: nothing from Task 1 (independent; values must match `GenderSchema`: `girl`, `boy`).
- Produces: Prisma client field `childProfile.gender: 'girl' | 'boy' | null`, Postgres enum type `"Gender"`, column `child_profiles.gender` (nullable). Tasks 3 and 7 rely on the column name `gender`.

- [ ] **Step 1: Add the enum to `schema.prisma`**

After the `HairStyle` enum block:

```prisma
/// Child gender — nullable profile attribute; picks the avatar face contour.
enum Gender {
  girl
  boy
}
```

- [ ] **Step 2: Add the field to `model ChildProfile`**

Directly after the `shirtColor` line:

```prisma
  /// Chosen by the parent in the avatar picker; null = unspecified (renders as boy).
  gender                      Gender?
```

(No `@map` needed — `gender` is already snake_case.)

- [ ] **Step 3: Create + apply the migration locally**

Run: `pnpm --filter @gabee/db run db:migrate -- --name child_gender`
Expected: `Your database is now in sync with your schema.` and a new folder `packages/db/prisma/migrations/*_child_gender/` containing `CREATE TYPE "Gender" AS ENUM ('girl', 'boy');` and `ALTER TABLE "child_profiles" ADD COLUMN "gender" "Gender";`

- [ ] **Step 4: Verify the column exists**

Run: `psql -d gabee -c "\d child_profiles" | grep gender`
Expected: `gender | "Gender" | ...` (nullable, no default)

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): nullable gender column on child_profiles"
```

---

### Task 3: Server plumbing — mappers, profiles service, kid summaries

**Files:**
- Modify: `apps/web/src/lib/server/mappers.ts` (`ChildRow` ~line 18, `mapChildProfile` ~line 51)
- Modify: `apps/web/src/lib/server/services/profiles.ts` (`createProfile` data ~line 99, `updateProfile` data ~line 150)
- Modify: `apps/web/src/lib/server/services/parent-kid-detail.ts` (`KidSummary` ~line 39, `listKidSummaries` ~line 148, `getKidSummary` ~line 172)

**Interfaces:**
- Consumes: Task 1 (`CreateProfileRequest.gender?`, `UpdateProfileRequest.gender?: Gender | null`, DTO `gender`), Task 2 (Prisma `gender` field).
- Produces: `ChildProfile` DTO (snake_case, incl. `gender`) from `mapChildProfile` — this is what `/api/profiles` returns and what the kid app syncs; `KidSummary.gender: Gender | null` for the parent kids pages.

- [ ] **Step 1: `mappers.ts`**

In `interface ChildRow`, after `shirtColor: string;`:

```ts
  gender: string | null;
```

In `mapChildProfile`, after `shirt_color: row.shirtColor,`:

```ts
    gender: row.gender,
```

- [ ] **Step 2: `services/profiles.ts`**

In `createProfile`'s `tx.childProfile.create` data, after the `shirtColor` line:

```ts
        gender: input.gender ?? null,
```

In `updateProfile`'s `prisma.childProfile.update` data, after the `shirt_color` spread line:

```ts
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
```

(Explicit `null` passes through and clears the column; omitted leaves it untouched.)

- [ ] **Step 3: `services/parent-kid-detail.ts`**

Add `Gender` to the file's `@gabee/types` type imports. In `interface KidSummary`, after `shirt_color: ShirtColor;`:

```ts
  gender: Gender | null;
```

In BOTH `listKidSummaries`'s map and `getKidSummary`'s return object, after `shirt_color: r.shirtColor,`:

```ts
    gender: r.gender,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS (0 errors). The API routes need no change — they validate with `CreateProfileRequestSchema`/`UpdateProfileRequestSchema`, which Task 1 already extended.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/mappers.ts apps/web/src/lib/server/services/profiles.ts apps/web/src/lib/server/services/parent-kid-detail.ts
git commit -m "feat(web/server): persist and expose child gender end-to-end"
```

---

### Task 4: Render the gendered face — `KidAvatar` (parent) + `ProfileAvatar` (kid app)

**Files:**
- Modify: `apps/web/src/app/parent/_components/kid-avatar.tsx`
- Modify: `apps/kid/src/components/Chrome.tsx` (`ProfileLike` ~line 23, `ProfileAvatar` ~line 31)

**Interfaces:**
- Consumes: `FACE_PATHS`, `type Gender` from Task 1.
- Produces: `KidAvatar` accepts `gender?: Gender | null` (new optional prop; all existing call sites keep compiling). `ProfileLike` gains `gender?: Gender | null` and `ProfileAvatar` reads `profile.gender`.

- [ ] **Step 1: `kid-avatar.tsx`**

Extend the `@gabee/types` import with `FACE_PATHS` and `type Gender`. Add the prop:

```ts
export function KidAvatar({
  skinTone,
  hairColor,
  hairStyle,
  shirtColor,
  gender,
  size = 48,
  label,
}: {
  skinTone?: SkinTone | null;
  hairColor?: HairColor | null;
  hairStyle?: HairStyle | null;
  shirtColor?: ShirtColor | null;
  gender?: Gender | null;
  size?: number;
  label?: string;
}) {
```

Inside the component, next to the other lookups:

```ts
  const face = FACE_PATHS[gender ?? 'boy'];
```

Extend the clip id so distinct looks keep distinct ids:

```ts
  const clip = `kidface-${skin.slice(1)}-${hair.slice(1)}-${shirt.slice(1)}-${hairStyle ?? ''}-${gender ?? ''}`;
```

Replace the hardcoded face path element

```tsx
        <path d="M 32 46 Q 32 34 50 34 Q 68 34 68 46 Q 68 62 60 70 Q 50 77 40 70 Q 32 62 32 46 Z" fill={skin} stroke={INK} strokeWidth="1.5" />
```

with:

```tsx
        <path d={face} fill={skin} stroke={INK} strokeWidth="1.5" />
```

- [ ] **Step 2: `Chrome.tsx` (kid app)**

Extend the `@gabee/types` import with `FACE_PATHS` and `type Gender`. In `ProfileLike`, after `shirt_color`:

```ts
  gender?: Gender | null;
```

In `ProfileAvatar`, next to the other lookups:

```ts
  const face = FACE_PATHS[profile.gender ?? 'boy'];
```

Replace the hardcoded face path element (same `d="M 32 46 …"` as above, at ~line 60) with:

```tsx
        <path d={face} fill={skin} stroke={INK} strokeWidth="1.5" />
```

No changes needed in `ProfileSelect.tsx` / `LockScreen.tsx` — they pass the whole synced profile object, which now carries `gender` via the DTO.

- [ ] **Step 3: Typecheck both apps**

Run: `pnpm --filter web typecheck && pnpm --filter kid typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/parent/_components/kid-avatar.tsx apps/kid/src/components/Chrome.tsx
git commit -m "feat(avatar): render per-gender face contour in both apps"
```

---

### Task 5: Parent UI — "Genre" picker row + add/edit forms

**Files:**
- Modify: `apps/web/src/app/parent/_components/avatar-picker.tsx`
- Modify: `apps/web/src/app/parent/kids/add-kid-modal.tsx` (look state ~line 119, submit body ~line 172)
- Modify: `apps/web/src/app/parent/kids/[id]/edit/edit-kid-form.tsx` (Props ~line 18, look state ~line 51, PATCH body ~line 83)
- Modify: `apps/web/src/app/parent/kids/[id]/edit/page.tsx` (`<EditKidForm …>` ~line 43)

**Interfaces:**
- Consumes: `KidAvatar` `gender` prop (Task 4), `type Gender` (Task 1), `KidSummary.gender` (Task 3, for the edit page).
- Produces: `AvatarLook` gains `gender: Gender | null` — both forms carry it in their `look` state and send it on the wire (`gender` key, omitted at create when null; explicit null on PATCH clears).

- [ ] **Step 1: `avatar-picker.tsx` — extend `AvatarLook` + add the Genre row**

Extend the `@gabee/types` import with `type Gender`. Update the interface and labels:

```ts
const LABELS: Record<'gender' | 'skin' | 'hair' | 'style' | 'shirt', { fr: string; en: string }> = {
  gender: { fr: 'Genre', en: 'Gender' },
  skin: { fr: 'Peau', en: 'Skin' },
  hair: { fr: 'Couleur cheveux', en: 'Hair colour' },
  style: { fr: 'Coiffure', en: 'Hairstyle' },
  shirt: { fr: 'Habit', en: 'Shirt' },
};

const GENDER_LABELS: Record<Gender, { fr: string; en: string }> = {
  boy: { fr: 'Garçon', en: 'Boy' },
  girl: { fr: 'Fille', en: 'Girl' },
};

export interface AvatarLook {
  skinTone: SkinTone;
  hairColor: HairColor;
  hairStyle: HairStyle;
  shirtColor: ShirtColor;
  gender: Gender | null;
}
```

Pass the chosen gender to the live preview and to the hairstyle mini-avatars (`<KidAvatar … gender={value.gender} />` in both places).

Insert the Genre row as the FIRST row inside `.avatar-picker-rows`, before the skin `SwatchRow`. The face contour barely reads at 40 px, so each button carries a text label (spec "UI parent"):

```tsx
        {/* Gender = face contour; barely legible at 40px, so each option
            carries a text label. Clicking the selected one clears back to
            unspecified (renders as the boy face). */}
        <div className="swatch-row">
          <span className="swatch-row-label">{LABELS.gender[lang]}</span>
          <div className="swatch-row-options" role="radiogroup" aria-label={LABELS.gender[lang]}>
            {(['boy', 'girl'] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={value.gender === g}
                aria-label={GENDER_LABELS[g][lang]}
                className={'style-swatch' + (value.gender === g ? ' on' : '')}
                style={{ height: 'auto', paddingBottom: 2 }}
                onClick={() => onChange({ ...value, gender: value.gender === g ? null : g })}
              >
                <KidAvatar
                  skinTone={value.skinTone}
                  hairColor={value.hairColor}
                  hairStyle={value.hairStyle}
                  shirtColor={value.shirtColor}
                  gender={g}
                  size={40}
                  label={GENDER_LABELS[g][lang]}
                />
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>
                  {GENDER_LABELS[g][lang]}
                </span>
              </button>
            ))}
          </div>
        </div>
```

- [ ] **Step 2: `add-kid-modal.tsx`**

Look state init (~line 119) gains:

```ts
    gender: null,
```

Submit body (~line 172), after `shirt_color: look.shirtColor,`:

```ts
          ...(look.gender ? { gender: look.gender } : {}),
```

- [ ] **Step 3: `edit-kid-form.tsx`**

Add `type Gender` to the `@gabee/types` imports. `Props` gains (after `shirtColor`):

```ts
  gender: Gender | null;
```

Destructure `gender: initialGender,` in the component signature; look state init gains:

```ts
    gender: initialGender,
```

PATCH body, after `shirt_color: look.shirtColor,` (always sent — explicit null clears):

```ts
          gender: look.gender,
```

- [ ] **Step 4: `edit/page.tsx`**

In the `<EditKidForm …>` call, after the `shirtColor` prop:

```tsx
        gender={kid.gender}
```

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/parent/_components/avatar-picker.tsx apps/web/src/app/parent/kids/add-kid-modal.tsx "apps/web/src/app/parent/kids/[id]/edit/edit-kid-form.tsx" "apps/web/src/app/parent/kids/[id]/edit/page.tsx"
git commit -m "feat(parent): gender row in avatar picker + add/edit forms"
```

---

### Task 6: Thread `gender` through the remaining display sites

**Files:**
- Modify: `apps/web/src/app/parent/kids/page.tsx` (`<KidAvatar …>` ~line 152)
- Modify: `apps/web/src/app/parent/kids/[id]/page.tsx` (`<KidAvatar …>` ~line 75)
- Modify: `apps/web/src/app/parent/classify/page.tsx` (prisma `select` ~line 30, `kidMap` ~line 42)
- Modify: `apps/web/src/app/parent/classify/classify-flow.tsx` (`ClassifyKidContext` ~line 19, `<KidAvatar …>` ~lines 277 and 481)

**Interfaces:**
- Consumes: `KidSummary.gender` (Task 3), `KidAvatar.gender` (Task 4), `type Gender` (Task 1).
- Produces: nothing consumed later — this closes the display loop. (`messages-list`/`compose-message`/`message-detail` use `KidAvatarMini`, an initials disc — no change.)

- [ ] **Step 1: kids list + kid detail**

In `kids/page.tsx` (~line 152) and `kids/[id]/page.tsx` (~line 75), add to the existing `<KidAvatar>` props, after `shirtColor={kid.shirt_color}`:

```tsx
          gender={kid.gender}
```

- [ ] **Step 2: classify server page**

In `classify/page.tsx`, add to the prisma `select` (after `shirtColor: true,`):

```ts
          gender: true,
```

and to the `kidMap[k.id]` literal (after `shirtColor: k.shirtColor,`):

```ts
      gender: k.gender,
```

- [ ] **Step 3: classify flow**

In `classify-flow.tsx`, add `Gender` to the `@gabee/types` type imports; in `ClassifyKidContext` (after `shirtColor`):

```ts
  gender: Gender | null;
```

At the ~line 277 `<KidAvatar>` add `gender={kid?.gender}`; at the ~line 481 one add `gender={k.gender}` (in both cases after the `shirtColor` prop).

- [ ] **Step 4: Typecheck + build web**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS / successful production build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/parent/kids/page.tsx "apps/web/src/app/parent/kids/[id]/page.tsx" apps/web/src/app/parent/classify/page.tsx apps/web/src/app/parent/classify/classify-flow.tsx
git commit -m "feat(parent): show gendered avatar face on kids, detail and classify views"
```

---

### Task 7: One-off production backfill (name-guessed genders)

**Files:**
- Create: `packages/db/prisma/backfill-gender.sql`

**Interfaces:**
- Consumes: Task 2's `gender` column and `"Gender"` enum type.
- Produces: a reviewed SQL file to be run MANUALLY against prod after the release is deployed (migrations applied). The implementer does NOT run it against prod — only against the local DB as a smoke test.

- [ ] **Step 1: Write the SQL**

```sql
-- One-off backfill (2026-07-10): set gender on pre-existing profiles, guessed
-- from first names and validated by Valentine (spec: 2026-07-10-avatar-gender-design.md).
-- Only touches rows still NULL, matches names exactly; 'kahi' (undetermined)
-- and 'Test' (throwaway) are deliberately left unset.
--
-- Run AFTER the child_gender migration is deployed:
--   local : psql -d gabee -f packages/db/prisma/backfill-gender.sql
--   prod  : ssh deploy-vps 'docker exec -i gabee-db-1 psql -U gabee -d gabee' \
--             < packages/db/prisma/backfill-gender.sql

UPDATE child_profiles SET gender = 'girl'
WHERE gender IS NULL
  AND name IN ('Léna', 'Ana', 'Eunice', 'Ana Gabrielle', 'Mya', 'Manoela');

UPDATE child_profiles SET gender = 'boy'
WHERE gender IS NULL
  AND name IN ('Gilles Perry', 'Ezekiel', 'Michel', 'Ibrahim', 'Thibaut',
               'Israel', 'Aaron', 'Ralf Matthis', 'Ily Mael');

-- Report what the table looks like afterwards.
SELECT name, gender FROM child_profiles ORDER BY created_at;
```

- [ ] **Step 2: Smoke-test locally**

Run: `psql -d gabee -f packages/db/prisma/backfill-gender.sql`
Expected: `UPDATE n` lines (local seed has three 'Ana' rows → they become `girl`; Noé/Lili stay NULL — Noé/Lili are not in the prod lists, which is fine for a smoke test), then the SELECT report with a `gender` column.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/backfill-gender.sql
git commit -m "chore(db): one-off gender backfill for pre-existing profiles"
```

---

### Task 8: End-to-end verification

**Files:** none (verification only).

**Interfaces:** consumes everything above.

- [ ] **Step 1: Full monorepo gates**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: all green (turbo across packages; remember `packages/types` runs node:test via tsx).

- [ ] **Step 2: Drive the parent flow**

Start the web app (`pnpm --filter web dev`), log in as a parent, then:
1. Open Add-kid: the picker's FIRST row is "Genre" with two labelled buttons (Garçon/Fille); nothing pre-selected; preview shows the current (boy) face.
2. Click "Fille": the preview chin visibly narrows (heart contour); click "Fille" again: it deselects and the preview returns to the boy face.
3. Create a kid with Fille selected; the kids list card and kid detail page show the heart-contour face.
4. Edit that kid: the Genre row shows Fille pre-selected; deselect, save, reload — face back to boy contour, DB column back to NULL (`psql -d gabee -c "SELECT name, gender FROM child_profiles;"`).

- [ ] **Step 3: Drive the kid app**

Start the kid app (`pnpm --filter kid dev`), pair/sync against local, and confirm the profile-select screen shows the girl face for the kid created above (and unchanged faces for others).

- [ ] **Step 4: Report**

No commit. Report the verification evidence (command outputs, what was observed in each flow) back to the user, plus the reminder that `backfill-gender.sql` is pending a MANUAL prod run after the next release.
