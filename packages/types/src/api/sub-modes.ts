import { z } from 'zod';
import { ModuleSchema, SubModeKeySchema } from '../enums';
import { BilingualStringSchema } from '../bilingual';

/**
 * Admin CRUD contracts for the SubMode registry (Phase 2A authoring).
 *
 * The per-row shape (`SubModeDefSchema`) and the list response shape
 * (`SubModesListResponseSchema`) live in `../sub-mode.ts` — re-used as-is so the
 * admin UI, the kid app and the AI provider all parse the same payload.
 *
 * `module` + `key` compose the registry id (`<module>.<key>`) and are immutable
 * once created — renaming a sub-mode would orphan every question/plan that
 * references it. The admin UI only allows editing name / language_dependent /
 * display_order / mechanic_hint.
 */

/** POST /api/admin/sub-modes — create a new sub-mode (super_admin). */
export const CreateSubModeRequestSchema = z.object({
  module: ModuleSchema,
  /** Short, lowercase key — unique within `module`. Composes the registry id. */
  key: z.string().regex(/^[a-z_]+$/, 'key must be lowercase a-z/_'),
  name: BilingualStringSchema,
  language_dependent: z.boolean(),
  display_order: z.number().int().min(1),
  mechanic_hint: z.string().min(1),
});
export type CreateSubModeRequest = z.infer<typeof CreateSubModeRequestSchema>;

/**
 * PATCH /api/admin/sub-modes/[id] — update a sub-mode (super_admin).
 *
 * `module` + `key` are NOT patchable (they compose the immutable id); a rename
 * would require deleting + re-creating, which the UI gates by reference count.
 */
export const UpdateSubModeRequestSchema = z
  .object({
    name: BilingualStringSchema,
    language_dependent: z.boolean(),
    display_order: z.number().int().min(1),
    mechanic_hint: z.string().min(1),
  })
  .partial();
export type UpdateSubModeRequest = z.infer<typeof UpdateSubModeRequestSchema>;

/** Path param schema — same as the registry id (`<module>.<key>`). */
export const SubModeIdParamSchema = SubModeKeySchema;
