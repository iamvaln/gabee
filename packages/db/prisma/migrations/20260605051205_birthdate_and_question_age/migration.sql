-- AlterTable
ALTER TABLE "child_profiles" ADD COLUMN     "birth_date" DATE;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "age_max" INTEGER,
ADD COLUMN     "age_min" INTEGER;
