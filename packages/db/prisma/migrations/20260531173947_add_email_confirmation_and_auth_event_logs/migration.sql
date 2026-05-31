-- CreateEnum
CREATE TYPE "AuthEventKind" AS ENUM ('signup', 'login_success', 'login_failure', 'logout', 'forgot_password_requested', 'password_reset_consumed', 'email_confirmation_sent', 'email_confirmed', 'password_changed');

-- AlterTable
ALTER TABLE "parent_accounts" ADD COLUMN     "email_confirmed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "email_confirmations" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_event_logs" (
    "id" UUID NOT NULL,
    "kind" "AuthEventKind" NOT NULL,
    "parent_id" UUID,
    "ip" TEXT,
    "user_agent" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_confirmations_token_hash_key" ON "email_confirmations"("token_hash");

-- CreateIndex
CREATE INDEX "email_confirmations_parent_id_idx" ON "email_confirmations"("parent_id");

-- CreateIndex
CREATE INDEX "auth_event_logs_parent_id_idx" ON "auth_event_logs"("parent_id");

-- CreateIndex
CREATE INDEX "auth_event_logs_kind_created_at_idx" ON "auth_event_logs"("kind", "created_at");

-- AddForeignKey
ALTER TABLE "email_confirmations" ADD CONSTRAINT "email_confirmations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_event_logs" ADD CONSTRAINT "auth_event_logs_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
