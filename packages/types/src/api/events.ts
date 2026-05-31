import { z } from 'zod';
import { EventEnvelopeSchema } from '../events';

/**
 * Event ingestion API (product §8, §9). The kid app batch-uploads buffered event
 * envelopes; the handler validates each against `packages/types` and persists.
 * Ingestion is idempotent via the envelope's client `event_id` (duplicates from
 * offline replays are counted, not re-stored).
 */

// POST /api/events
export const IngestEventsRequestSchema = z.object({
  events: z.array(EventEnvelopeSchema).min(1).max(500),
});
export type IngestEventsRequest = z.infer<typeof IngestEventsRequestSchema>;

export const IngestEventsResponseSchema = z.object({
  accepted: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  /** event_ids the server rejected (e.g. failed validation), so the client can drop them. */
  rejected: z.array(z.uuid()).default([]),
});
export type IngestEventsResponse = z.infer<typeof IngestEventsResponseSchema>;
