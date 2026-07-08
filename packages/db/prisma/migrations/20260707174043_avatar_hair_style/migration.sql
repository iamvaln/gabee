-- CreateEnum
CREATE TYPE "HairStyle" AS ENUM ('style_short', 'style_curly', 'style_afro', 'style_long', 'style_pigtails', 'style_bun');

-- AlterTable
ALTER TABLE "child_profiles" ADD COLUMN     "hair_style" "HairStyle" NOT NULL DEFAULT 'style_short';
