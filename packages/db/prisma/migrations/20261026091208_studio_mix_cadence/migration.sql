-- Editorial mix + posting cadence (owner decisions 2026-10-26). Additive only.
-- - studio_settings.posting_days: the weekdays each platform posts on (default
--   LinkedIn Tue/Wed/Thu, TikTok Mon/Wed/Fri/Sun).
-- - content_slots.pillar: gabee | light | value; existing day lines are `value`.
-- - agent_versions.source: seed | owner; every existing version came from the
--   seed, so the seed may upgrade it when its instruction file changes.

-- AlterTable
ALTER TABLE "agent_versions" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'seed';

-- AlterTable
ALTER TABLE "content_slots" ADD COLUMN     "pillar" TEXT NOT NULL DEFAULT 'value';

-- AlterTable
ALTER TABLE "studio_settings" ADD COLUMN     "posting_days" JSONB NOT NULL DEFAULT '{"linkedin": [2, 3, 4], "tiktok": [0, 1, 3, 5]}';
