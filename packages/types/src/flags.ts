import { z } from 'zod';

/**
 * Admin feature flags (design 2026-07-16). The set of known flags is CODE, not
 * data — a typo'd key is a compile error. Precedence at read time:
 * parent override > DB enabledDefault > code fallback (never-fetched only).
 */
export const FLAG_KEYS = ['kid_voiceover', 'kid_ambient_music'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

/** Code fallback when the device has NEVER fetched flags (offline-first). */
export const FLAG_FALLBACKS: Record<FlagKey, boolean> = {
  kid_voiceover: true, // live before flags existed — dark-launch OFF would regress
  kid_ambient_music: false, // ships dark; admin releases
};

/** Initial DB `enabledDefault`, seeded ONCE (create-only; admin edits thereafter). */
export const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  kid_voiceover: true,
  kid_ambient_music: false,
};

/** Seeded description; the admin UI can edit the stored copy. */
export const FLAG_DESCRIPTIONS: Record<FlagKey, string> = {
  kid_voiceover:
    "Voiceover / narration across the whole voice surface (kid app now; parent-app voice UI when it lands).",
  kid_ambient_music: 'Ambient background music on non-session kid screens.',
};

export const FlagKeySchema = z.enum(FLAG_KEYS);

/** Kid-facing effective flags. `record` (not the enum) so the server can send
 *  keys a client build doesn't know yet; the client filters to its registry. */
export const EffectiveFlagsResponseSchema = z.object({
  flags: z.record(z.string(), z.boolean()),
});
export type EffectiveFlagsResponse = z.infer<typeof EffectiveFlagsResponseSchema>;

// ── Admin contracts ──────────────────────────────────────────────────────────
export const AdminFlagRowSchema = z.object({
  key: z.string(),
  description: z.string(),
  enabled_default: z.boolean(),
  override_count: z.number().int().nonnegative(),
});
export type AdminFlagRow = z.infer<typeof AdminFlagRowSchema>;

export const AdminFlagsListResponseSchema = z.object({ flags: z.array(AdminFlagRowSchema) });
export type AdminFlagsListResponse = z.infer<typeof AdminFlagsListResponseSchema>;

export const UpdateFlagRequestSchema = z.object({
  enabled_default: z.boolean().optional(),
  description: z.string().max(200).optional(),
});
export type UpdateFlagRequest = z.infer<typeof UpdateFlagRequestSchema>;

export const FlagOverrideRowSchema = z.object({
  parent_id: z.string().uuid(),
  email: z.string(),
  enabled: z.boolean(),
});
export type FlagOverrideRow = z.infer<typeof FlagOverrideRowSchema>;

export const FlagOverridesResponseSchema = z.object({ overrides: z.array(FlagOverrideRowSchema) });
export type FlagOverridesResponse = z.infer<typeof FlagOverridesResponseSchema>;

export const SetFlagOverrideRequestSchema = z.object({
  email: z.string().email(),
  enabled: z.boolean(),
});
export type SetFlagOverrideRequest = z.infer<typeof SetFlagOverrideRequestSchema>;

export const DeleteFlagOverrideRequestSchema = z.object({
  email: z.string().email(),
});
export type DeleteFlagOverrideRequest = z.infer<typeof DeleteFlagOverrideRequestSchema>;
