-- The classification-digest cron sidecar reads this column to dedupe — when
-- the cron fires daily, a parent on the `weekly` cadence should only get an
-- email once every 7 days, not every day. Null means "never sent yet"; the
-- cron treats that as immediately-due if there's anything to classify.
ALTER TABLE "notification_prefs"
  ADD COLUMN "last_classification_digest_sent_at" TIMESTAMP(3);
