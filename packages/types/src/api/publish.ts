import { z } from 'zod';
import { ModuleSchema } from '../enums';

/**
 * Explicit publish + bundle versioning (product §5, §8). The "live" pool surfaced to
 * the kid app via `/api/bundles` is no longer the current `confirmed` set — it's the
 * most recently published snapshot in `ContentBundleVersion`. The admin reviews the
 * delta between the confirmed pool and the latest published snapshot, then clicks
 * "Publish v(N+1)" per module to mint a new snapshot.
 *
 * Additive: the legacy `BundleManifestEntry` shape (module/version/question_count/
 * published_at) stays valid so the kid app keeps consuming the manifest unchanged.
 */

// ─── Pending-changes diff ────────────────────────────────────────────────────

/** Per-module diff between the current confirmed pool and the latest published version. */
export const PendingChangesPerModuleSchema = z.object({
  module: ModuleSchema,
  /** Version number of the latest published snapshot for this module, or null if never published. */
  current_version: z.number().int().min(1).nullable(),
  current_published_at: z.iso.datetime().nullable(),
  /** Question count in the latest published snapshot (0 when never published). */
  current_question_count: z.number().int().min(0),
  pending: z.object({
    /** IDs in the confirmed pool that aren't in the latest snapshot. */
    added: z.array(z.string()),
    /** IDs in the latest snapshot that are no longer in the confirmed pool. */
    removed: z.array(z.string()),
    /** IDs present in both whose `updatedAt` is newer than the snapshot's `publishedAt`. */
    modified: z.array(z.string()),
  }),
  /** Convenience flag: true when added/removed/modified is non-empty. */
  has_changes: z.boolean(),
});
export type PendingChangesPerModule = z.infer<typeof PendingChangesPerModuleSchema>;

// GET /api/admin/content/pending  → diff for every module (admin publish-manager).
export const PendingChangesResponseSchema = z.object({
  modules: z.array(PendingChangesPerModuleSchema),
});
export type PendingChangesResponse = z.infer<typeof PendingChangesResponseSchema>;

// ─── Publish ─────────────────────────────────────────────────────────────────

// POST /api/admin/content/publish  → mint a new ContentBundleVersion for a module.
export const PublishRequestSchema = z.object({
  module: ModuleSchema,
});
export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export const PublishResponseSchema = z.object({
  module: ModuleSchema,
  version: z.number().int().min(1),
  question_count: z.number().int().min(0),
  published_at: z.iso.datetime(),
});
export type PublishResponse = z.infer<typeof PublishResponseSchema>;

// ─── Versioned manifest entry (v2) ───────────────────────────────────────────

/**
 * v2 manifest entry — identical shape to the existing `BundleManifestEntry` plus
 * the explicit `version` field already exposed there, but typed independently so we
 * can evolve it (e.g. add `is_legacy: boolean`) without churning the kid-app
 * contract. The actual GET `/api/bundles` response still validates as
 * `BundleManifestResponse` for back-compat.
 */
export const BundleManifestEntryV2Schema = z.object({
  module: ModuleSchema,
  version: z.number().int().min(0),
  published_at: z.iso.datetime(),
  question_count: z.number().int().min(0),
});
export type BundleManifestEntryV2 = z.infer<typeof BundleManifestEntryV2Schema>;
