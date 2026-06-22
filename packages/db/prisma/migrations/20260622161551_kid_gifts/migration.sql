-- CreateEnum
CREATE TYPE "KidGiftStatus" AS ENUM ('pending', 'claimed', 'revoked');

-- CreateTable
CREATE TABLE "kid_gifts" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "reason" TEXT,
    "granted_by" TEXT,
    "status" "KidGiftStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "claimed_total_stars" INTEGER,

    CONSTRAINT "kid_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kid_gifts_child_id_status_idx" ON "kid_gifts"("child_id", "status");

-- AddForeignKey
ALTER TABLE "kid_gifts" ADD CONSTRAINT "kid_gifts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
