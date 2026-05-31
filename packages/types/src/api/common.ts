import { z } from 'zod';

/**
 * Shared API envelope shapes. Every route handler in `apps/web` parses requests and
 * serializes responses through these (+ the per-endpoint schemas), and the kid app
 * imports the same schemas — contracts are never redefined locally (brief).
 */

/** Standard error body returned by the API. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Optional field-level details (e.g. Zod issues), safe to surface to clients. */
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** A generic success acknowledgement for endpoints with no resource body. */
export const OkResponseSchema = z.object({ success: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;
