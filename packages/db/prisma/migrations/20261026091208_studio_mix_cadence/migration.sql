-- Editorial mix + posting cadence (owner decisions 2026-10-26). Additive only.
-- - studio_settings.posting_days: the weekdays each platform posts on (default
--   LinkedIn Tue/Wed/Thu, TikTok Mon/Wed/Fri/Sun).
-- - content_slots.pillar: gabee | light | value. Existing day lines stay NULL
--   (planned before pillars existed); every titles run sets it from now on.
-- - agent_versions.source: seed | owner. Every existing version came from the
--   seed, so they are backfilled `seed` (the seed may upgrade them when their
--   instruction file changes). A row written without a source is the owner's:
--   the column defaults to `owner`, and the seed always writes `seed` itself.

-- AlterTable
ALTER TABLE "agent_versions" ADD COLUMN "source" TEXT;
UPDATE "agent_versions" SET "source" = 'seed';
ALTER TABLE "agent_versions" ALTER COLUMN "source" SET NOT NULL;
ALTER TABLE "agent_versions" ALTER COLUMN "source" SET DEFAULT 'owner';

-- AlterTable
ALTER TABLE "content_slots" ADD COLUMN "pillar" TEXT;

-- AlterTable
ALTER TABLE "studio_settings" ADD COLUMN "posting_days" JSONB NOT NULL DEFAULT '{"linkedin": [2, 3, 4], "tiktok": [0, 1, 3, 5]}';
