-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('mobile', 'tablet', 'desktop');

-- AlterTable
ALTER TABLE "device_links" ADD COLUMN     "client_device_id" TEXT;

-- AlterTable
ALTER TABLE "session_classifications" ADD COLUMN     "tz" TEXT,
ADD COLUMN     "tz_offset_min" INTEGER;

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "parent_id" UUID NOT NULL,
    "device_link_id" UUID,
    "ua_full" TEXT NOT NULL,
    "os" TEXT,
    "os_version" TEXT,
    "browser" TEXT,
    "browser_version" TEXT,
    "device_type" "DeviceType",
    "device_model" TEXT,
    "screen_w" INTEGER,
    "screen_h" INTEGER,
    "dpr" DOUBLE PRECISION,
    "tz" TEXT,
    "tz_offset_min" INTEGER,
    "locale" TEXT,
    "app_version" TEXT,
    "pwa_standalone" BOOLEAN,
    "last_ip" TEXT,
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_ip_sightings" (
    "id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "ua_full" TEXT,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_ip_sightings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_id_key" ON "devices"("device_id");

-- CreateIndex
CREATE INDEX "devices_parent_id_idx" ON "devices"("parent_id");

-- CreateIndex
CREATE INDEX "devices_device_link_id_idx" ON "devices"("device_link_id");

-- CreateIndex
CREATE INDEX "device_ip_sightings_device_id_seen_at_idx" ON "device_ip_sightings"("device_id", "seen_at");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_ip_sightings" ADD CONSTRAINT "device_ip_sightings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE CASCADE ON UPDATE CASCADE;
