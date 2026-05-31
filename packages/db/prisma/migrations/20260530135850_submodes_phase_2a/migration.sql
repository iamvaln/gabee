-- Phase 2A — promote sub-modes to a first-class authoring dimension.
--
-- Changes:
--   1. Convert questions.sub_mode from enum WordsSubMode? to TEXT NOT NULL DEFAULT 'default',
--      backfilling per-module defaults (Words rows keep their existing key).
--   2. Add content_plans.sub_mode TEXT NOT NULL DEFAULT 'default', backfill non-Words rows
--      with 'default', and widen the unique to (curriculum_id, module_id, sub_mode, level).
--   3. Drop the now-dead WordsSubMode enum type.
--   4. Create the sub_modes registry table (seeded by prisma/seed.ts).

-- ─── questions.sub_mode: enum → text with backfill ─────────────────────────────
-- 1. Add a new text column with default 'default'.
ALTER TABLE "questions" ADD COLUMN "sub_mode_new" TEXT NOT NULL DEFAULT 'default';

-- 2. Backfill from the existing enum + module.
--    Words: copy the enum value verbatim ('picture' | 'fill' | 'build' | 'read').
--    Numbers: arithmetic (per the Phase 2A registry).
--    Keyboard: static (typed mode is the default; scrolling comes later).
--    Code: find_path (movement-block puzzles are the entry track).
--    Translation: default (single track).
UPDATE "questions"
SET "sub_mode_new" = CASE
  WHEN "sub_mode" IS NOT NULL THEN "sub_mode"::text
  WHEN "module" = 'numbers' THEN 'arithmetic'
  WHEN "module" = 'keyboard' THEN 'static'
  WHEN "module" = 'code' THEN 'find_path'
  WHEN "module" = 'translation' THEN 'default'
  ELSE 'default'
END;

-- 3. Drop the old enum column and rename.
ALTER TABLE "questions" DROP COLUMN "sub_mode";
ALTER TABLE "questions" RENAME COLUMN "sub_mode_new" TO "sub_mode";

-- ─── content_plans.sub_mode: add + widen unique ───────────────────────────────
ALTER TABLE "content_plans" ADD COLUMN "sub_mode" TEXT NOT NULL DEFAULT 'default';

-- Replace the old (curriculum, module, level) unique with the (curriculum, module, sub_mode, level) one.
DROP INDEX "content_plans_curriculum_id_module_id_level_key";
CREATE UNIQUE INDEX "content_plans_curriculum_id_module_id_sub_mode_level_key"
  ON "content_plans"("curriculum_id", "module_id", "sub_mode", "level");

-- ─── Drop the now-dead WordsSubMode enum type ─────────────────────────────────
DROP TYPE "WordsSubMode";

-- ─── sub_modes registry table ─────────────────────────────────────────────────
CREATE TABLE "sub_modes" (
    "id" TEXT NOT NULL,
    "module" "Module" NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "language_dependent" BOOLEAN NOT NULL,
    "display_order" INTEGER NOT NULL,
    "mechanic_hint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_modes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sub_modes_module_key_key" ON "sub_modes"("module", "key");
