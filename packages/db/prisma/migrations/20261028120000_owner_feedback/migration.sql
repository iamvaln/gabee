-- Owner feedback to the agents (👍/👎 and/or a note on a direction, a day title or a draft),
-- read back into the concerned agent's memory. Additive: a new table only.
CREATE TABLE "owner_feedback" (
    "id" UUID NOT NULL,
    "agent_key" TEXT NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "week_id" UUID NOT NULL,
    "proposal_index" INTEGER,
    "subject_summary" TEXT NOT NULL,
    "sentiment" TEXT,
    "note" TEXT,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_feedback_pkey" PRIMARY KEY ("id"),
    -- A feedback says something: a sentiment, a note, or both.
    CONSTRAINT "owner_feedback_says_something" CHECK ("sentiment" IS NOT NULL OR "note" IS NOT NULL)
);

CREATE INDEX "owner_feedback_agent_key_created_at_idx" ON "owner_feedback"("agent_key", "created_at");

CREATE INDEX "owner_feedback_week_id_idx" ON "owner_feedback"("week_id");

-- One direction feedback per (week, proposal, admin); title and draft rows have no
-- proposal index (NULLs are distinct), so their notes append.
CREATE UNIQUE INDEX "owner_feedback_subject_kind_subject_id_proposal_index_actor_key" ON "owner_feedback"("subject_kind", "subject_id", "proposal_index", "actor_id");

ALTER TABLE "owner_feedback" ADD CONSTRAINT "owner_feedback_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "content_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
