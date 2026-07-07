-- CreateEnum
CREATE TYPE "SkinTone" AS ENUM ('skin_1', 'skin_2', 'skin_3', 'skin_4', 'skin_5', 'skin_6');

-- CreateEnum
CREATE TYPE "HairColor" AS ENUM ('hair_black', 'hair_brown', 'hair_chestnut', 'hair_blonde', 'hair_ginger', 'hair_grey');

-- CreateEnum
CREATE TYPE "ShirtColor" AS ENUM ('shirt_blue', 'shirt_purple', 'shirt_green', 'shirt_pink', 'shirt_honey', 'shirt_cyan', 'shirt_coral', 'shirt_ink');

-- AlterTable
ALTER TABLE "child_profiles" ADD COLUMN     "hair_color" "HairColor" NOT NULL DEFAULT 'hair_brown',
ADD COLUMN     "shirt_color" "ShirtColor" NOT NULL DEFAULT 'shirt_blue',
ADD COLUMN     "skin_tone" "SkinTone" NOT NULL DEFAULT 'skin_2',
ALTER COLUMN "avatar" DROP NOT NULL;

-- Backfill existing rows from their legacy `avatar` so kids keep their look
-- instead of all resetting to the column default. Skin was a single hardcoded
-- tone (#F4C7A1 = skin_2) for everyone before this; hair/shirt come from the
-- old AVATAR_LOOKS table. Mirrors LEGACY_AVATAR_LOOK in @gabee/types.
UPDATE "child_profiles" SET
  "skin_tone"  = 'skin_2',
  "hair_color" = CASE "avatar"
    WHEN 'avatar_1' THEN 'hair_brown'::"HairColor"
    WHEN 'avatar_2' THEN 'hair_blonde'::"HairColor"
    WHEN 'avatar_3' THEN 'hair_black'::"HairColor"
    WHEN 'avatar_4' THEN 'hair_ginger'::"HairColor"
    ELSE 'hair_brown'::"HairColor"
  END,
  "shirt_color" = CASE "avatar"
    WHEN 'avatar_1' THEN 'shirt_blue'::"ShirtColor"
    WHEN 'avatar_2' THEN 'shirt_purple'::"ShirtColor"
    WHEN 'avatar_3' THEN 'shirt_green'::"ShirtColor"
    WHEN 'avatar_4' THEN 'shirt_pink'::"ShirtColor"
    ELSE 'shirt_blue'::"ShirtColor"
  END
WHERE "avatar" IS NOT NULL;
