import { z } from 'zod';
import { AvatarSchema, LanguageSchema } from '../enums';
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
  avatar: AvatarSchema,
  language: LanguageSchema,
  audio_enabled: z.boolean().optional(),
});
export type CreateProfileRequest = z.infer<typeof CreateProfileRequestSchema>;

// PATCH /api/profiles/:id
export const UpdateProfileRequestSchema = z
  .object({
    name: z.string().min(2).max(20),
    avatar: AvatarSchema,
    language: LanguageSchema,
    audio_enabled: z.boolean(),
  })
  .partial();
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

// POST / PATCH response
export const ProfileResponseSchema = z.object({ profile: ChildProfileSchema });
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
