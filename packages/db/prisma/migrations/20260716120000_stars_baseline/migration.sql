-- Bound `total_stars` by evidence the server can count (correct answers + claimed
-- gifts). `stars_baseline` grandfathers stars that predate that rule — manual grants
-- and any progress from before event ingest — so applying the cap can't freeze a real
-- kid's stars. Defaults to 0: new profiles are capped tightly from day one.
ALTER TABLE "child_profiles" ADD COLUMN "stars_baseline" INTEGER NOT NULL DEFAULT 0;
