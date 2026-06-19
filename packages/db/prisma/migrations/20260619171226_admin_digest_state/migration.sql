-- CreateTable
CREATE TABLE "admin_digest_state" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "last_weekly_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_digest_state_pkey" PRIMARY KEY ("id")
);
