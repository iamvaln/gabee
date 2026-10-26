-- « Copier et ouvrir »: where the owner posts on each platform (Réglages, super-admin).
ALTER TABLE "platform_profiles" ADD COLUMN "publish_url" TEXT;

-- Defaults (owner, 2026-10-26): the Gabee LinkedIn page's post composer, and
-- TikTok Studio's upload page. Only rows without a link yet: never replaces one set in Réglages.
UPDATE "platform_profiles" SET "publish_url" = 'https://www.linkedin.com/company/109660238/admin/page-posts/published/?share=true'
WHERE "platform" = 'linkedin' AND "publish_url" IS NULL;
UPDATE "platform_profiles" SET "publish_url" = 'https://www.tiktok.com/tiktokstudio/upload'
WHERE "platform" = 'tiktok' AND "publish_url" IS NULL;

-- « J'utilise ma propre vidéo / mon propre média »: the owner posts with a file outside the library.
ALTER TABLE "content_drafts" ADD COLUMN "external_media" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "content_drafts" ADD COLUMN "external_media_note" TEXT;
