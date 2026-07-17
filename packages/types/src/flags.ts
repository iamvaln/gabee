import { z } from 'zod';
import type { Module } from './enums';

/**
 * Admin feature flags (design 2026-07-16). The set of known flags is CODE, not
 * data — a typo'd key is a compile error. Precedence at read time:
 * parent override > DB enabledDefault > code fallback (never-fetched only).
 */
export const FLAG_KEYS = ['kid_voiceover', 'kid_ambient_music', 'kid_game_sounds', 'code_l6', 'code_draw_l4'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

/** Code fallback when the device has NEVER fetched flags (offline-first). */
export const FLAG_FALLBACKS: Record<FlagKey, boolean> = {
  kid_voiceover: true, // live before flags existed — dark-launch OFF would regress
  kid_ambient_music: false, // ships dark; admin releases
  kid_game_sounds: true, // SFX cues are live — dark-launch OFF would regress
  code_l6: false, // content flag — ships dark
  code_draw_l4: false, // content flag — ships dark
};

/** Initial DB `enabledDefault`, seeded ONCE (create-only; admin edits thereafter). */
export const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  kid_voiceover: true,
  kid_ambient_music: false,
  kid_game_sounds: true,
  code_l6: false,
  code_draw_l4: false,
};

/** Seeded description; the admin UI can edit the stored copy. */
export const FLAG_DESCRIPTIONS: Record<FlagKey, string> = {
  kid_voiceover:
    "Voiceover / narration across the whole voice surface (kid app now; parent-app voice UI when it lands).",
  kid_ambient_music: 'Ambient background music on non-session kid screens.',
  kid_game_sounds: 'Game sound effects — correct/wrong cues, navigation blips, celebration.',
  code_l6: 'Coding level 6 (Debugging) — rollout gate. Dark until released per parent.',
  code_draw_l4: 'Coding Draw world pen ladder (L4 Pen conditions + L5 Combine) — rollout gate. Dark until released per parent.',
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

// ── Content rollout maps ─────────────────────────────────────────────────────
// A module/level absent here has NO flag → always visible. Gate only the newest
// trailing levels of a module (never a middle level).
export const MODULE_FLAG: Partial<Record<Module, FlagKey>> = {
  // e.g. later: a new module → its `module_<id>` flag
};
export const LEVEL_FLAG: Record<string, FlagKey> = {
  'code:6': 'code_l6',
};
export function moduleFlag(m: Module): FlagKey | undefined {
  return MODULE_FLAG[m];
}
export function levelFlag(m: Module, level: number): FlagKey | undefined {
  return LEVEL_FLAG[`${m}:${level}`];
}

// World-scoped level gate — for modules (only `code`) whose levels split into
// parallel worlds that ship on their own schedule. `code:6` (debug) gates every
// world's L6 via LEVEL_FLAG; the draw world's pen ladder (L4 conditions + L5
// combine) is gated by ONE flag so it reveals as a unit — no mid-level gap — and
// leaves the already-live maze/actions L4/L5 untouched. Keyed
// `${module}:${world}:${level}`; absent → no world gate (module gate still applies).
export const WORLD_LEVEL_FLAG: Record<string, FlagKey> = {
  'code:draw:4': 'code_draw_l4',
  'code:draw:5': 'code_draw_l4',
};
export function worldLevelFlag(m: Module, world: string, level: number): FlagKey | undefined {
  return WORLD_LEVEL_FLAG[`${m}:${world}:${level}`];
}
