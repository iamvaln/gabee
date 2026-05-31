-- CreateEnum
CREATE TYPE "KidMessageStatus" AS ENUM ('unread', 'read', 'deleted_by_sender');

-- AlterTable
ALTER TABLE "parent_accounts" ADD COLUMN     "display_name_for_kids" VARCHAR(50) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "kid_messages" (
    "id" UUID NOT NULL,
    "from_parent_id" UUID NOT NULL,
    "to_child_id" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "status" "KidMessageStatus" NOT NULL DEFAULT 'unread',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "kid_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_kid_messages_to_child_unread" ON "kid_messages"("to_child_id", "created_at");

-- CreateIndex
CREATE INDEX "kid_messages_from_parent_id_created_at_idx" ON "kid_messages"("from_parent_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "kid_messages" ADD CONSTRAINT "kid_messages_from_parent_id_fkey" FOREIGN KEY ("from_parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kid_messages" ADD CONSTRAINT "kid_messages_to_child_id_fkey" FOREIGN KEY ("to_child_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
