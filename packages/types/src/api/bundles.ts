import { z } from 'zod';
import { ModuleSchema } from '../enums';
import { QuestionRecordSchema } from '../question';

/**
 * Question bundles API (product §5, §8). Confirmed, bilingual questions are exposed
 * to the kid app as versioned per-module bundles that the service worker caches for
 * offline play. The kid app pulls a new bundle only when its version changes.
 */

/**
 * One entry in the bundle manifest: a module and its current bundle version.
 *
 * `version` is `0` when no `ContentBundleVersion` snapshot exists yet — the
 * manifest is sourced from the live confirmed pool as a fallback so a brand-new
 * install with admin-only content still surfaces something. The kid app treats
 * 0 as "always re-pull" since the live pool is moving.
 */
export const BundleManifestEntrySchema = z.object({
  module: ModuleSchema,
  version: z.number().int().min(0),
  question_count: z.number().int().min(0),
  published_at: z.iso.datetime(),
});
export type BundleManifestEntry = z.infer<typeof BundleManifestEntrySchema>;

// GET /api/bundles  → which bundles exist and at what version (cheap; drives "should I pull?")
export const BundleManifestResponseSchema = z.object({
  bundles: z.array(BundleManifestEntrySchema),
});
export type BundleManifestResponse = z.infer<typeof BundleManifestResponseSchema>;

// GET /api/bundles/:module[?version=N]  → questions in the published snapshot, or
// the live confirmed pool (version 0) when no snapshot exists.
export const QuestionBundleResponseSchema = z.object({
  module: ModuleSchema,
  version: z.number().int().min(0),
  published_at: z.iso.datetime(),
  questions: z.array(QuestionRecordSchema),
});
export type QuestionBundleResponse = z.infer<typeof QuestionBundleResponseSchema>;
