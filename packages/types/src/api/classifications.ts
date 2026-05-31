import { z } from 'zod';
import { ModuleSchema, InitiationLabelSchema } from '../enums';

/**
 * Session classification API (product §9.3, §13.2). After the kid device syncs, new
 * session starts surface here as a queue for the parent to label. This is the explicit,
 * not-inferred adherence signal — a session is either classified or visibly pending.
 */

/** A session awaiting a label. */
export const PendingSessionSchema = z.object({
  session_id: z.uuid(),
  profile_id: z.uuid(),
  started_at: z.iso.datetime(),
  /** Best-effort context to help the parent remember (first module touched, total play time). */
  first_module: ModuleSchema.nullable().default(null),
  duration_s: z.number().min(0).nullable().default(null),
});
export type PendingSession = z.infer<typeof PendingSessionSchema>;

// GET /api/classifications/pending?child_id=
export const PendingSessionsResponseSchema = z.object({
  sessions: z.array(PendingSessionSchema),
});
export type PendingSessionsResponse = z.infer<typeof PendingSessionsResponseSchema>;

/** One classification decision. */
export const ClassificationItemSchema = z.object({
  session_id: z.uuid(),
  label: InitiationLabelSchema,
});
export type ClassificationItem = z.infer<typeof ClassificationItemSchema>;

// POST /api/classifications  — batch-labellable, so the queue clears in one submit (UX §5.2)
export const ClassifyRequestSchema = z.object({
  items: z.array(ClassificationItemSchema).min(1),
  /** From the email nudge, to compute classification latency (product §9.5). */
  nudge_sent_at: z.iso.datetime().nullable().optional(),
});
export type ClassifyRequest = z.infer<typeof ClassifyRequestSchema>;

export const ClassifyResponseSchema = z.object({
  classified: z.array(
    z.object({
      session_id: z.uuid(),
      label: InitiationLabelSchema,
      classified_at: z.iso.datetime(),
    }),
  ),
});
export type ClassifyResponse = z.infer<typeof ClassifyResponseSchema>;
