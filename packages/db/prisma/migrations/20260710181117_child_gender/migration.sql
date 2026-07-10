-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('girl', 'boy');

-- AlterTable
ALTER TABLE "child_profiles" ADD COLUMN "gender" "Gender";
