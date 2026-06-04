import { z } from 'zod';
import {
  ModuleSchema,
  QuestionTypeSchema,
  QuestionStatusSchema,
  QuestionLangSchema,
  ErrorTypeSchema,
  LevelSchema,
  LessonSchema,
  DifficultySchema,
} from './enums';
import { BilingualStringSchema, isBilingual } from './bilingual';

/**
 * A prompt/answer/option value. Either a bare value (language-agnostic, e.g. the
 * numeral `37` or the arithmetic prompt `"23 + 14"`) or a bilingual `{ fr, en }`
 * pair (language-dependent text). See product Appendix B.4.
 */
export const QuestionValueSchema = z.union([z.string().min(1), z.number(), BilingualStringSchema]);
export type QuestionValue = z.infer<typeof QuestionValueSchema>;

/**
 * A wrong-answer option. Either a bare value (as in Appendix B.4's `[35, 47, 27]`)
 * or a tagged object so the chosen distractor rolls up by error category (product §9.2).
 */
export const DistractorSchema = z.union([
  QuestionValueSchema,
  z.object({
    value: QuestionValueSchema,
    error_type: ErrorTypeSchema.optional(),
  }),
]);
export type Distractor = z.infer<typeof DistractorSchema>;

/** A single rating, recordable per language so FR/EN quality is tracked separately (product §5). */
export const RatingSchema = z.object({
  rater_id: z.string().min(1),
  score: z.number().int().min(1).max(5),
  lang: z.enum(['fr', 'en']).optional(),
});
export type Rating = z.infer<typeof RatingSchema>;

const QuestionRecordBaseSchema = z.object({
  id: z.string().min(1),
  module: ModuleSchema,
  /**
   * Sub-mode identifier — accepts either the registry dotted-id (`words.picture`,
   * `numbers.arithmetic`) OR the legacy short key (`picture`, `fill`...) for kid-app
   * back-compat. Defaults to `"default"` for non-sub-moded modules. See `SubMode`.
   */
  sub_mode: z.string().default('default'),
  level: LevelSchema,
  /** Lessons 1-3 own pools; the revision (4) samples across them and has no pool of its own. */
  lesson: LessonSchema,
  theme: z.string().min(1),
  type: QuestionTypeSchema,
  prompt: QuestionValueSchema,
  answer: QuestionValueSchema,
  /** ≥ 2 plausible wrong answers where applicable (product §5). */
  distractors: z.array(DistractorSchema).default([]),
  /**
   * Optional hint surfaced to the kid after a wrong attempt — a short
   * encouragement that nudges toward the answer WITHOUT revealing it. Same
   * value shape as the prompt: bilingual `{ fr, en }` when `lang === 'both'`,
   * bare string/number otherwise. Authoring norm is ≤80 characters per language.
   */
  hint: QuestionValueSchema.optional(),
  difficulty: DifficultySchema,
  concept_tags: z.array(z.string().min(1)).default([]),
  /** `null` = language-agnostic; `'both'` = language-dependent (FR+EN present). */
  lang: QuestionLangSchema,
  /**
   * Module-specific configuration that doesn't fit prompt/answer — e.g. a Code grid
   * (start, target, obstacles, optimal_blocks). Refined per module when each is built.
   */
  config: z.unknown().optional(),
  created_by: z.string().min(1), // 'ai' | admin/user id
  ratings: z.array(RatingSchema).default([]),
  avg_rating: z.number().min(0).max(5).nullable().default(null),
  status: QuestionStatusSchema.default('candidate'),
});

/**
 * A question record (product §5, Appendix B.4).
 *
 * Bilingual parity is enforced structurally:
 * - `lang: 'both'` requires the prompt to be a bilingual `{ fr, en }` pair.
 * - `lang: null` requires a bare (non-bilingual) prompt.
 * A language-dependent question missing a language therefore fails validation rather
 * than shipping half-translated (product §5; brief conventions).
 */
export const QuestionRecordSchema = QuestionRecordBaseSchema.refine(
  (q) => (q.lang === 'both' ? isBilingual(q.prompt) : !isBilingual(q.prompt)),
  {
    error: "lang 'both' requires a bilingual { fr, en } prompt; lang null requires a bare prompt",
    path: ['prompt'],
  },
).refine(
  // Hint, when present, must mirror the question's language stance: bilingual
  // for `lang:'both'`, bare for `lang:null`. Keeps FR/EN parity at the schema
  // level so a half-translated hint is rejected on insert, not at runtime.
  (q) => q.hint === undefined || (q.lang === 'both' ? isBilingual(q.hint) : !isBilingual(q.hint)),
  {
    error: "lang 'both' requires a bilingual { fr, en } hint; lang null requires a bare hint",
    path: ['hint'],
  },
);
export type QuestionRecord = z.infer<typeof QuestionRecordSchema>;

/** Input shape for seeding/creating a question (defaults applied; pre-refinement base). */
export const QuestionInputSchema = QuestionRecordBaseSchema;
export type QuestionInput = z.input<typeof QuestionInputSchema>;
