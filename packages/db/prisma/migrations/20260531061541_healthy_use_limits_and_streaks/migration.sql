-- AlterTable
ALTER TABLE "child_profiles" ADD COLUMN     "daily_lesson_target_override" INTEGER,
ADD COLUMN     "daily_total_cap_min_override" INTEGER,
ADD COLUMN     "last_lesson_date" DATE,
ADD COLUMN     "longest_streak_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "look_away_enabled_override" BOOLEAN,
ADD COLUMN     "session_hard_cap_min_override" INTEGER,
ADD COLUMN     "session_soft_limit_min_override" INTEGER,
ADD COLUMN     "streak_days" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "healthy_use_limits" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "daily_lesson_target_min" INTEGER NOT NULL DEFAULT 1,
    "daily_lesson_target_default" INTEGER NOT NULL DEFAULT 4,
    "daily_lesson_target_max" INTEGER NOT NULL DEFAULT 12,
    "session_soft_limit_min_min" INTEGER NOT NULL DEFAULT 30,
    "session_soft_limit_min_default" INTEGER NOT NULL DEFAULT 60,
    "session_soft_limit_min_max" INTEGER NOT NULL DEFAULT 120,
    "session_hard_cap_min_min" INTEGER NOT NULL DEFAULT 45,
    "session_hard_cap_min_default" INTEGER NOT NULL DEFAULT 120,
    "session_hard_cap_min_max" INTEGER NOT NULL DEFAULT 180,
    "daily_total_cap_min_min" INTEGER NOT NULL DEFAULT 60,
    "daily_total_cap_min_default" INTEGER NOT NULL DEFAULT 180,
    "daily_total_cap_min_max" INTEGER NOT NULL DEFAULT 300,
    "look_away_interval_min" INTEGER NOT NULL DEFAULT 10,
    "look_away_pause_sec" INTEGER NOT NULL DEFAULT 20,
    "look_away_enabled_default" BOOLEAN NOT NULL DEFAULT true,
    "streak_enabled" BOOLEAN NOT NULL DEFAULT true,
    "badges_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "healthy_use_limits_pkey" PRIMARY KEY ("id")
);
