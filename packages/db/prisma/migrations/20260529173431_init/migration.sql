-- CreateEnum
CREATE TYPE "Language" AS ENUM ('fr', 'en');

-- CreateEnum
CREATE TYPE "Avatar" AS ENUM ('avatar_1', 'avatar_2', 'avatar_3', 'avatar_4');

-- CreateEnum
CREATE TYPE "Module" AS ENUM ('numbers', 'words', 'keyboard', 'code', 'translation');

-- CreateEnum
CREATE TYPE "WordsSubMode" AS ENUM ('picture', 'fill', 'build', 'read');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('candidate', 'confirmed', 'rejected', 'demoted');

-- CreateEnum
CREATE TYPE "InitiationLabel" AS ENUM ('child_initiated', 'prompted', 'unsure');

-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('parent', 'admin', 'super_admin');

-- CreateEnum
CREATE TYPE "ModuleStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "ContentPlanStatus" AS ENUM ('pending', 'ai_draft', 'accepted');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('new', 'read', 'replied', 'archived');

-- CreateEnum
CREATE TYPE "GdprKind" AS ENUM ('access', 'export', 'erase');

-- CreateEnum
CREATE TYPE "GdprStatus" AS ENUM ('new', 'verifying', 'in_progress', 'done');

-- CreateEnum
CREATE TYPE "FeedbackScope" AS ENUM ('module', 'level', 'lesson');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('new', 'triaged', 'closed');

-- CreateTable
CREATE TABLE "parent_accounts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL DEFAULT 'parent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "parent_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_credentials" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'scrypt',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMP(3),

    CONSTRAINT "parent_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_profiles" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" "Avatar" NOT NULL,
    "language" "Language" NOT NULL,
    "audio_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),
    "total_stars" INTEGER NOT NULL DEFAULT 0,
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "progress_by_module" JSONB NOT NULL DEFAULT '{}',
    "progress_by_module_per_language" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "child_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "module" "Module" NOT NULL,
    "sub_mode" "WordsSubMode",
    "level" INTEGER NOT NULL,
    "lesson" INTEGER NOT NULL,
    "theme" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "objective_ref" TEXT,
    "prompt" JSONB NOT NULL,
    "answer" JSONB NOT NULL,
    "distractors" JSONB NOT NULL DEFAULT '[]',
    "difficulty" INTEGER NOT NULL,
    "concept_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lang" TEXT,
    "config" JSONB,
    "created_by" TEXT NOT NULL,
    "ratings" JSONB NOT NULL DEFAULT '[]',
    "avg_rating" DOUBLE PRECISION,
    "status" "QuestionStatus" NOT NULL DEFAULT 'candidate',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_bundle_versions" (
    "id" UUID NOT NULL,
    "module" "Module" NOT NULL,
    "version" INTEGER NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question_count" INTEGER NOT NULL,
    "question_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "content_bundle_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "profile_id" UUID,
    "session_id" UUID,
    "name" TEXT NOT NULL,
    "client_ts" TIMESTAMP(3) NOT NULL,
    "server_ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_classifications" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "first_module" "Module",
    "duration_s" DOUBLE PRECISION,
    "label" "InitiationLabel",
    "classified_at" TIMESTAMP(3),
    "nudge_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_observations" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricula" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" "Module" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "color_token" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "characteristics" JSONB NOT NULL,
    "status" "ModuleStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_plans" (
    "id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "module_id" "Module" NOT NULL,
    "level" INTEGER NOT NULL,
    "scope" JSONB NOT NULL,
    "pedagogical_objectives" JSONB NOT NULL DEFAULT '[]',
    "validation_criteria" JSONB NOT NULL,
    "notes" TEXT,
    "status" "ContentPlanStatus" NOT NULL DEFAULT 'pending',
    "ai_meta" JSONB,
    "accepted_by" TEXT,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_role" "AccountRole" NOT NULL,
    "kind" TEXT NOT NULL,
    "target_kind" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "diff" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'new',
    "source" TEXT NOT NULL DEFAULT 'landing_contact',
    "read_by" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gdpr_requests" (
    "id" UUID NOT NULL,
    "kind" "GdprKind" NOT NULL,
    "parent_id" UUID,
    "email" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "GdprStatus" NOT NULL DEFAULT 'new',
    "steps" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gdpr_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "child_id" UUID,
    "scope" "FeedbackScope" NOT NULL,
    "target" JSONB NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'new',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "closed_by" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION,
    "actor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parent_accounts_email_key" ON "parent_accounts"("email");

-- CreateIndex
CREATE INDEX "parent_credentials_parent_id_retired_at_idx" ON "parent_credentials"("parent_id", "retired_at");

-- CreateIndex
CREATE INDEX "child_profiles_parent_id_idx" ON "child_profiles"("parent_id");

-- CreateIndex
CREATE INDEX "questions_module_level_lesson_status_idx" ON "questions"("module", "level", "lesson", "status");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE INDEX "questions_curriculum_id_idx" ON "questions"("curriculum_id");

-- CreateIndex
CREATE INDEX "content_bundle_versions_module_idx" ON "content_bundle_versions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "content_bundle_versions_module_version_key" ON "content_bundle_versions"("module", "version");

-- CreateIndex
CREATE UNIQUE INDEX "events_event_id_key" ON "events"("event_id");

-- CreateIndex
CREATE INDEX "events_profile_id_name_idx" ON "events"("profile_id", "name");

-- CreateIndex
CREATE INDEX "events_session_id_idx" ON "events"("session_id");

-- CreateIndex
CREATE INDEX "events_name_server_ts_idx" ON "events"("name", "server_ts");

-- CreateIndex
CREATE UNIQUE INDEX "session_classifications_session_id_key" ON "session_classifications"("session_id");

-- CreateIndex
CREATE INDEX "session_classifications_profile_id_label_idx" ON "session_classifications"("profile_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_observations_profile_id_week_start_key" ON "weekly_observations"("profile_id", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "modules_slug_key" ON "modules"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "content_plans_curriculum_id_module_id_level_key" ON "content_plans"("curriculum_id", "module_id", "level");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_kind_created_at_idx" ON "audit_logs"("kind", "created_at");

-- CreateIndex
CREATE INDEX "inbox_messages_status_created_at_idx" ON "inbox_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "gdpr_requests_status_created_at_idx" ON "gdpr_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "feedback_status_created_at_idx" ON "feedback"("status", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_provider_model_created_at_idx" ON "ai_usage"("provider", "model", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_purpose_created_at_idx" ON "ai_usage"("purpose", "created_at");

-- AddForeignKey
ALTER TABLE "parent_credentials" ADD CONSTRAINT "parent_credentials_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_classifications" ADD CONSTRAINT "session_classifications_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_observations" ADD CONSTRAINT "weekly_observations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
