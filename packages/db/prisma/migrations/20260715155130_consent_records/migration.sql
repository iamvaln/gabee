-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('terms');

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "type" "ConsentType" NOT NULL DEFAULT 'terms',
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_records_parent_id_type_accepted_at_idx" ON "consent_records"("parent_id", "type", "accepted_at");

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
