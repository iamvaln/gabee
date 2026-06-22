-- AlterTable
ALTER TABLE "parent_accounts" ADD COLUMN     "first_classification_at" TIMESTAMP(3),
ADD COLUMN     "first_kid_added_at" TIMESTAMP(3),
ADD COLUMN     "first_login_at" TIMESTAMP(3),
ADD COLUMN     "first_message_sent_at" TIMESTAMP(3);
