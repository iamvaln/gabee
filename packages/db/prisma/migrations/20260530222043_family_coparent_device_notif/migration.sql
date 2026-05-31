-- CreateEnum
CREATE TYPE "CoparentLinkRole" AS ENUM ('primary', 'coparent');

-- CreateEnum
CREATE TYPE "CoparentInviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "NotificationDigestCadence" AS ENUM ('daily', 'every_2_days', 'weekly', 'off');

-- CreateEnum
CREATE TYPE "FamilyActionKind" AS ENUM ('session_classified', 'feedback_left', 'feedback_edited', 'kid_added', 'kid_edited', 'kid_removed', 'device_paired', 'device_revoked', 'coparent_invited', 'coparent_joined', 'coparent_removed', 'message_sent', 'message_deleted');

-- CreateTable
CREATE TABLE "parent_child_links" (
    "parent_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "role" "CoparentLinkRole" NOT NULL DEFAULT 'coparent',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invited_by" UUID,

    CONSTRAINT "parent_child_links_pkey" PRIMARY KEY ("parent_id","child_id")
);

-- CreateTable
CREATE TABLE "coparent_invites" (
    "id" UUID NOT NULL,
    "inviter_parent_id" UUID NOT NULL,
    "invitee_email" TEXT NOT NULL,
    "child_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "token" TEXT NOT NULL,
    "personal_note" TEXT,
    "status" "CoparentInviteStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "coparent_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_links" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "user_agent_hint" TEXT,
    "refresh_token_id" UUID NOT NULL,
    "paired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "device_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_pair_tokens" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "target_email" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "resulting_device_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_pair_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_prefs" (
    "parent_id" UUID NOT NULL,
    "classification_digest" "NotificationDigestCadence" NOT NULL DEFAULT 'daily',
    "weekly_summary" BOOLEAN NOT NULL DEFAULT true,
    "feedback_response" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_prefs_pkey" PRIMARY KEY ("parent_id")
);

-- CreateTable
CREATE TABLE "family_activity_log" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "actor_parent_id" UUID NOT NULL,
    "action" "FamilyActionKind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parent_child_links_child_id_idx" ON "parent_child_links"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "coparent_invites_token_key" ON "coparent_invites"("token");

-- CreateIndex
CREATE INDEX "coparent_invites_invitee_email_status_idx" ON "coparent_invites"("invitee_email", "status");

-- CreateIndex
CREATE INDEX "coparent_invites_inviter_parent_id_status_idx" ON "coparent_invites"("inviter_parent_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "device_links_refresh_token_id_key" ON "device_links"("refresh_token_id");

-- CreateIndex
CREATE INDEX "device_links_parent_id_revoked_at_idx" ON "device_links"("parent_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_pair_tokens_token_key" ON "device_pair_tokens"("token");

-- CreateIndex
CREATE INDEX "device_pair_tokens_parent_id_expires_at_idx" ON "device_pair_tokens"("parent_id", "expires_at");

-- CreateIndex
CREATE INDEX "family_activity_log_child_id_created_at_idx" ON "family_activity_log"("child_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "family_activity_log_actor_parent_id_created_at_idx" ON "family_activity_log"("actor_parent_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "parent_child_links" ADD CONSTRAINT "parent_child_links_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_child_links" ADD CONSTRAINT "parent_child_links_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coparent_invites" ADD CONSTRAINT "coparent_invites_inviter_parent_id_fkey" FOREIGN KEY ("inviter_parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_links" ADD CONSTRAINT "device_links_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_activity_log" ADD CONSTRAINT "family_activity_log_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_activity_log" ADD CONSTRAINT "family_activity_log_actor_parent_id_fkey" FOREIGN KEY ("actor_parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
