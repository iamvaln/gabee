import { z } from 'zod';
import { ModuleSchema, SubModeKeySchema } from './enums';
import { BilingualStringSchema } from './bilingual';

/**
 * Sub-mode registry definition (Phase 2A). A first-class authoring dimension across
 * every module — each row owns a `(module, key)` slot, e.g. `numbers.arithmetic`,
 * `words.picture`. The list is seeded by `packages/db/prisma/seed.ts`.
 *
 * The kid app stays language-agnostic per agnostic module (numbers/keyboard/code),
 * but `language_dependent` lets the admin/parent UI show per-track stats and the
 * progress engine split FR/EN tracks (product §7.3).
 *
 * `mechanic_hint` is fed verbatim into the AI prompt so generated questions stay
 * on-pattern (e.g. picture → emoji + bilingual word answers).
 */
export const SubModeDefSchema = z.object({
  /** Registry id — `<module>.<key>`, e.g. `"words.picture"`. */
  id: SubModeKeySchema,
  module: ModuleSchema,
  /** Short, lowercase key — unique within `module`. */
  key: z.string().regex(/^[a-z_]+$/, 'key must be lowercase a-z/_'),
  name: BilingualStringSchema,
  language_dependent: z.boolean(),
  display_order: z.number().int().min(1),
  /** One-line hint fed to the AI prompt to keep generations on-pattern. */
  mechanic_hint: z.string().min(1),
});
export type SubModeDef = z.infer<typeof SubModeDefSchema>;

/** Response from `GET /api/admin/sub-modes` (or wherever the registry is listed). */
export const SubModesListResponseSchema = z.object({
  sub_modes: z.array(SubModeDefSchema),
});
export type SubModesListResponse = z.infer<typeof SubModesListResponseSchema>;
