import { z } from 'zod';
import {
  ProgressByModuleSchema,
  ProgressByModulePerLanguageSchema,
} from '../progress';

/**
 * Progress sync API (product §8). The kid is the only writer for their own progress,
 * so conflicts are rare; resolution is last-write-wins per field, compared against
 * the device's `updated_at`. The response returns the authoritative merged state.
 */

// POST /api/progress/sync
export const ProgressSyncRequestSchema = z.object({
  profile_id: z.uuid(),
  /** Device clock when this snapshot was taken — the basis for last-write-wins (product §8). */
  updated_at: z.iso.datetime(),
  progress_by_module: ProgressByModuleSchema.optional(),
  progress_by_module_per_language: ProgressByModulePerLanguageSchema.optional(),
  total_stars: z.number().int().min(0).optional(),
  badges: z.array(z.string()).optional(),
});
export type ProgressSyncRequest = z.infer<typeof ProgressSyncRequestSchema>;

export const ProgressSyncResponseSchema = z.object({
  profile_id: z.uuid(),
  server_ts: z.iso.datetime(),
  progress_by_module: ProgressByModuleSchema,
  progress_by_module_per_language: ProgressByModulePerLanguageSchema,
  total_stars: z.number().int().min(0),
  badges: z.array(z.string()),
});
export type ProgressSyncResponse = z.infer<typeof ProgressSyncResponseSchema>;
