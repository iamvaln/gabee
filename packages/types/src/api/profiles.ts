import { z } from 'zod';
import { GenderSchema, HairColorSchema, HairStyleSchema, LanguageSchema, ShirtColorSchema, SkinToneSchema } from '../enums';
import { ChildProfileSchema } from '../progress';

/**
 * Profiles API — CRUD for up to 3 child profiles per parent account (product §7.1).
 * Kid device calls `GET /api/profiles` after pairing to download the parent's profiles;
 * profile creation/edits are parent-initiated.
 */

// GET /api/profiles
export const ListProfilesResponseSchema = z.object({
  profiles: z.array(ChildProfileSchema).max(3),
});
export type ListProfilesResponse = z.infer<typeof ListProfilesResponseSchema>;

// POST /api/profiles
export const CreateProfileRequestSchema = z.object({
  name: z.string().min(2).max(20),
  /** Recolourable look. Optional on the wire — the server fills the default
   *  look for any dimension the client omits. */
  skin_tone: SkinToneSchema.optional(),
  hair_color: HairColorSchema.optional(),
  hair_style: HairStyleSchema.optional(),
  shirt_color: ShirtColorSchema.optional(),
  gender: GenderSchema.optional(),
  language: LanguageSchema,
  /** ISO date (YYYY-MM-DD); the add-kid form requires it, optional here for API back-compat. */
  birth_date: z.iso.date().optional(),
  audio_enabled: z.boolean().optional(),
  /**
   * Co-parent extension policy on new-kid creation (parent spec §7.1, co-parent §10).
   * When the creating parent ALREADY has linked co-parents, the client asks:
   *   "Garder la coparence pour ce nouvel enfant ?" — Yes = `true` → the new
   *   kid is also linked to every existing co-parent. No = `false` → only the
   *   primary parent is linked (a co-parent can later be granted access per
   *   kid).
   * Omitted = same as `true` (default to "extend" so first-kid creation by a
   * lone parent doesn't need to send the flag).
   */
  share_with_existing_coparents: z.boolean().optional(),
});
export type CreateProfileRequest = z.infer<typeof CreateProfileRequestSchema>;

// PATCH /api/profiles/:id
export const UpdateProfileRequestSchema = z
  .object({
    name: z.string().min(2).max(20),
    skin_tone: SkinToneSchema,
    hair_color: HairColorSchema,
    hair_style: HairStyleSchema,
    shirt_color: ShirtColorSchema,
    /** Nullable so an explicit null CLEARS the gender back to unspecified. */
    gender: GenderSchema.nullable(),
    language: LanguageSchema,
    birth_date: z.iso.date(),
    audio_enabled: z.boolean(),
  })
  .partial();
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

// POST / PATCH response
export const ProfileResponseSchema = z.object({ profile: ChildProfileSchema });
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
