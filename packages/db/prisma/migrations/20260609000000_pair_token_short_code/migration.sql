-- Short-code path for device pairing. Each device_pair_tokens row now also
-- carries a 6-char human-typable code (e.g. "A8K-3R7"); the parent enters it
-- on the kid device AFTER signing in with email/password, which is what
-- gates abuse — the code alone is useless without a matching parent JWT.
-- Both the existing link path and the new code path consume the same row.
ALTER TABLE "device_pair_tokens"
  ADD COLUMN "short_code" TEXT;

-- Partial unique index: only enforce uniqueness on UNUSED, UNEXPIRED tokens.
-- Once a code is consumed it can be re-used by a future row without a race.
-- Used both for lookup performance and for collision-safe insert.
CREATE UNIQUE INDEX "device_pair_tokens_short_code_active_unique"
  ON "device_pair_tokens" ("short_code")
  WHERE "short_code" IS NOT NULL AND "used_at" IS NULL;
