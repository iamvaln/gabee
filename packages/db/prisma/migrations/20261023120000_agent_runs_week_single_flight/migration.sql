-- Single-flight guard for the week-level Strategist runs (Ruling 15), enforced
-- by the database: at most one `running` agent run per week across the two
-- week subject kinds (proposals and titles share the week id as subject id).
-- The app's check-then-act guard (assertNoLiveWeekRun) could let two
-- concurrent requests both start a paid run; with this index the second run's
-- INSERT fails (P2002) and the API answers 409 generation_in_progress.
--
-- Before inserting, the app marks a week's `running` rows older than the
-- 20-minute window `failed` (error_code `abandoned`), so a crashed run cannot
-- block the week forever.

-- Existing duplicates (should be none) would stop the index build: keep the
-- newest running row of each week, close the others as abandoned.
UPDATE "agent_runs" r
SET "status" = 'failed',
    "error_code" = 'abandoned',
    "error_message" = 'Closed by migration: another run of this week was running.',
    "finished_at" = (now() AT TIME ZONE 'UTC')
WHERE r."status" = 'running'
  AND r."subject_kind" IN ('week_proposals', 'week_titles')
  AND EXISTS (
    SELECT 1 FROM "agent_runs" n
    WHERE n."status" = 'running'
      AND n."subject_kind" IN ('week_proposals', 'week_titles')
      AND n."subject_id" = r."subject_id"
      AND (n."started_at", n."id") > (r."started_at", r."id")
  );

CREATE UNIQUE INDEX "agent_runs_week_running_unique"
  ON "agent_runs" ("subject_id")
  WHERE "status" = 'running' AND "subject_kind" IN ('week_proposals', 'week_titles');
