-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "agent_run_id" UUID,
ADD COLUMN     "error_code" TEXT,
ADD COLUMN     "latency_ms" INTEGER,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'succeeded',
ADD COLUMN     "task" TEXT;

-- AlterTable
ALTER TABLE "parent_accounts" ADD COLUMN     "signup_source" JSONB;

-- CreateTable
CREATE TABLE "studio_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Douala',
    "recipients" TEXT[],
    "enabled_platforms" TEXT[] DEFAULT ARRAY['linkedin', 'tiktok']::TEXT[],
    "monthly_budget_usd" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "budget_alert_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "budget_alert_sent_for" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_objectives" (
    "id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "targets" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_line_versions" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "product_facts" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editorial_line_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_profiles" (
    "platform" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "media_aspect" TEXT NOT NULL,
    "bio_link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_profiles_pkey" PRIMARY KEY ("platform")
);

-- CreateTable
CREATE TABLE "content_weeks" (
    "id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "first_day" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposing',
    "objective_id" UUID,
    "proposals" JSONB,
    "chosen_index" INTEGER,
    "refinement" TEXT,
    "platform_angles" JSONB,
    "validated_at" TIMESTAMP(3),
    "validated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_slots" (
    "id" UUID NOT NULL,
    "week_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "topic" TEXT NOT NULL,
    "angle" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL,
    "platforms" JSONB NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "skip_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_drafts" (
    "id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "current_version_id" UUID,
    "approved_version_id" UUID,
    "media_asset_id" UUID,
    "tracked_url" TEXT NOT NULL,
    "generation_lock_until" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_draft_versions" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "n" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "agent_version_id" UUID,
    "payload" JSONB NOT NULL,
    "edited_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_draft_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_publications" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "post_url" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_s" DOUBLE PRECISION,
    "aspect" TEXT,
    "language" TEXT,
    "tags" TEXT[],
    "origin" TEXT NOT NULL DEFAULT 'upload',
    "checksum" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reject_reason" TEXT,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "clearance_note" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "capabilities" TEXT[],
    "input_usd_per_mtok" DOUBLE PRECISION NOT NULL,
    "output_usd_per_mtok" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "unhealthy_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ai_task_routes" (
    "id" UUID NOT NULL,
    "task" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "model_key" TEXT NOT NULL,
    "effort" TEXT NOT NULL,
    "max_tokens" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_task_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "key" TEXT NOT NULL,
    "published_version_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "agent_versions" (
    "id" UUID NOT NULL,
    "agent_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "instructions" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "published_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "agent_key" TEXT NOT NULL,
    "agent_version_id" UUID NOT NULL,
    "origin" TEXT NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error_code" TEXT,
    "error_message" TEXT,
    "latency_ms" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "job_key" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_notifications" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "provider_id" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_visits" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" DATE NOT NULL,
    "path" TEXT NOT NULL,
    "lang" TEXT,
    "device_class" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "referrer_host" TEXT,

    CONSTRAINT "web_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_objectives_month_key" ON "content_objectives"("month");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_line_versions_version_key" ON "editorial_line_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "content_weeks_starts_on_key" ON "content_weeks"("starts_on");

-- CreateIndex
CREATE INDEX "content_weeks_status_idx" ON "content_weeks"("status");

-- CreateIndex
CREATE INDEX "content_slots_date_idx" ON "content_slots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "content_slots_week_id_date_key" ON "content_slots"("week_id", "date");

-- CreateIndex
CREATE INDEX "content_drafts_status_idx" ON "content_drafts"("status");

-- CreateIndex
CREATE INDEX "content_drafts_media_asset_id_idx" ON "content_drafts"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_drafts_slot_id_platform_key" ON "content_drafts"("slot_id", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "content_draft_versions_draft_id_n_key" ON "content_draft_versions"("draft_id", "n");

-- CreateIndex
CREATE UNIQUE INDEX "content_publications_draft_id_key" ON "content_publications"("draft_id");

-- CreateIndex
CREATE INDEX "content_publications_published_at_idx" ON "content_publications"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_object_key_key" ON "media_assets"("object_key");

-- CreateIndex
CREATE INDEX "media_assets_status_cleared_kind_idx" ON "media_assets"("status", "cleared", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ai_task_routes_task_rank_key" ON "ai_task_routes"("task", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "agents_published_version_id_key" ON "agents"("published_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_versions_agent_key_version_key" ON "agent_versions"("agent_key", "version");

-- CreateIndex
CREATE INDEX "agent_runs_subject_kind_subject_id_idx" ON "agent_runs"("subject_kind", "subject_id");

-- CreateIndex
CREATE INDEX "agent_runs_agent_key_started_at_idx" ON "agent_runs"("agent_key", "started_at");

-- CreateIndex
CREATE INDEX "job_runs_status_next_attempt_at_idx" ON "job_runs"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_job_key_period_key_key" ON "job_runs"("job_key", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "studio_notifications_kind_period_key_recipient_key" ON "studio_notifications"("kind", "period_key", "recipient");

-- CreateIndex
CREATE INDEX "web_visits_day_source_idx" ON "web_visits"("day", "source");

-- CreateIndex
CREATE INDEX "web_visits_content_idx" ON "web_visits"("content");

-- CreateIndex
CREATE INDEX "ai_usage_task_created_at_idx" ON "ai_usage"("task", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_agent_run_id_idx" ON "ai_usage"("agent_run_id");

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_weeks" ADD CONSTRAINT "content_weeks_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "content_objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_slots" ADD CONSTRAINT "content_slots_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "content_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "content_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "content_draft_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_approved_version_id_fkey" FOREIGN KEY ("approved_version_id") REFERENCES "content_draft_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_draft_versions" ADD CONSTRAINT "content_draft_versions_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_draft_versions" ADD CONSTRAINT "content_draft_versions_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_routes" ADD CONSTRAINT "ai_task_routes_model_key_fkey" FOREIGN KEY ("model_key") REFERENCES "ai_models"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "agent_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_key_fkey" FOREIGN KEY ("agent_key") REFERENCES "agents"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_key_fkey" FOREIGN KEY ("agent_key") REFERENCES "agents"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
