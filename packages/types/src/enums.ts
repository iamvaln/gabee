import { z } from 'zod';

/**
 * Enumerations and shared primitive schemas.
 * Zod schemas are the single source of truth; TS types are inferred from them.
 */

// ─── Modules ─────────────────────────────────────────────────────────────────

/** The five learning modules (product §4). */
export const ModuleSchema = z.enum(['numbers', 'words', 'keyboard', 'code', 'translation']);
export type Module = z.infer<typeof ModuleSchema>;

/**
 * Sub-mode key — the dotted-id form `<module>.<key>` from the SubMode registry,
 * e.g. `"numbers.arithmetic"`, `"words.picture"`. Phase 2A makes sub-modes a
 * first-class authoring dimension across every module (not just Words).
 *
 * The registry is in the DB (`sub_modes` table, seeded by `prisma/seed.ts`); see
 * `packages/types/src/sub-mode.ts` for the per-row shape.
 */
// Curriculum v0.1 keys include hyphens (`words.fill-blank`, `numbers.word-problems`,
// `translation.fr-en`). Module part is plain lowercase; key part allows hyphens.
export const SubModeKeySchema = z
  .string()
  .regex(/^[a-z]+\.[a-z][a-z_-]*$/, 'subMode must be `<module>.<key>`');
export type SubModeKey = z.infer<typeof SubModeKeySchema>;

/**
 * The four Words exercise types (product §4.2). Phase 2A switches Words sub-modes
 * to the dotted-id form (`words.picture` etc.), but the kid PWA still consumes the
 * short keys — kept here for back-compat shims and event payloads.
 */
export const WORDS_SUB_MODES = ['picture', 'fill-blank', 'build-sentence', 'read-answer'] as const;
export const WordsSubModeSchema = z.enum(WORDS_SUB_MODES);
export type WordsSubMode = z.infer<typeof WordsSubModeSchema>;

/**
 * Language-AGNOSTIC modules: one progress track each; switching language only
 * changes presentation (product §7.3).
 */
export const AgnosticModuleSchema = z.enum(['numbers', 'keyboard', 'code']);
export type AgnosticModule = z.infer<typeof AgnosticModuleSchema>;

/**
 * Language-DEPENDENT tracks: progress is stored separately per language because
 * fr and en are distinct skills (product §7.3). Keys mirror
 * `progress_by_module_per_language`.
 */
export const TrackSchema = z.enum([
  'words_picture',
  'words_fill',
  'words_build',
  'words_read',
  'translation',
]);
export type Track = z.infer<typeof TrackSchema>;

// ─── Language ────────────────────────────────────────────────────────────────

/** Active UI/content language; switchable anytime, no locked primary (product §2). */
export const LanguageSchema = z.enum(['fr', 'en']);
export type Language = z.infer<typeof LanguageSchema>;

/**
 * A question's language disposition (product §5, Appendix B.4):
 * - `null`  → language-agnostic (e.g. bare arithmetic `23 + 14`), no `{ fr, en }` pairs
 * - `'both'`→ language-dependent; both FR and EN must be present to be confirmed
 */
export const QuestionLangSchema = z.enum(['both']).nullable();
export type QuestionLang = z.infer<typeof QuestionLangSchema>;

/** FR↔EN direction for the Translation module (product §4.5, both ways per level). */
export const TranslationDirectionSchema = z.enum(['fr_to_en', 'en_to_fr']);
export type TranslationDirection = z.infer<typeof TranslationDirectionSchema>;

// ─── Question metadata ───────────────────────────────────────────────────────

/** Rendering/interaction type of a question (drives the kid-app input pattern). */
export const QuestionTypeSchema = z.enum([
  'mcq-number', // Numbers: pick a numeral
  'mcq-word', // Words fill-the-blank / picture→word: pick a word
  'mcq-image', // Picture→word: image prompt, pick the word
  'build-sentence', // Words build-a-sentence (word cloud)
  'read-answer', // Words read & answer (passage + comprehension)
  'typing', // Keyboard: type the target text
  'code-grid', // Code: arrange blocks on a grid
  'translation', // Translation: produce/pick in the other language
]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/** Curation lifecycle of a question (admin spec §6.1): candidate → confirmed; or rejected/demoted. */
export const QuestionStatusSchema = z.enum(['candidate', 'confirmed', 'rejected', 'demoted']);
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;

/**
 * Diagnostic tag on a wrong answer (distractor) — the highest-leverage analytics
 * win (product §9.2). Open-ended on purpose; the spec's examples are conventions,
 * not an exhaustive set.
 */
export const ErrorTypeSchema = z.string().min(1);
export type ErrorType = z.infer<typeof ErrorTypeSchema>;

/** Canonical `error_type` values from the spec (product §9.2) — for reference/seeding. */
export const KNOWN_ERROR_TYPES = [
  'off-by-one',
  'place-value',
  'semantic-neighbor',
  'false-cognate',
] as const;

// ─── Profile / avatar ────────────────────────────────────────────────────────

/** Legacy four fixed looks (MVP). Kept for back-compat on rows created before
 *  the recolour system; new rows use the skin/hair/shirt dimensions below and
 *  the enum is no longer written. Visual identity only, no behavioral effect. */
export const AvatarSchema = z.enum(['avatar_1', 'avatar_2', 'avatar_3', 'avatar_4']);
export type Avatar = z.infer<typeof AvatarSchema>;

// Recolourable avatar: three independently-picked dimensions instead of 4 fixed
// combos. Visual identity only. Palettes are the source of truth for BOTH the
// picker swatches and the SVG fills — the shared <KidAvatar> maps id → hex.

/** Inclusive skin-tone range, light → deep. */
export const SkinToneSchema = z.enum(['skin_1', 'skin_2', 'skin_3', 'skin_4', 'skin_5', 'skin_6']);
export type SkinTone = z.infer<typeof SkinToneSchema>;

/** Natural hair colours + a couple of playful ones. */
export const HairColorSchema = z.enum([
  'hair_black',
  'hair_brown',
  'hair_chestnut',
  'hair_blonde',
  'hair_ginger',
  'hair_grey',
]);
export type HairColor = z.infer<typeof HairColorSchema>;

/** Hair SHAPE (independent of colour). Each maps to SVG path(s) in
 *  HAIR_STYLE_PATHS below — a `front` layer drawn over the face and an optional
 *  `back` layer drawn behind it (for long/afro/pigtails/bun that frame the head). */
export const HairStyleSchema = z.enum([
  'style_short', // the legacy single cap — default + backfill target
  'style_curly',
  'style_afro',
  'style_long',
  'style_pigtails',
  'style_bun',
]);
export type HairStyle = z.infer<typeof HairStyleSchema>;

/** Shirt colours drawn from the brand + module palette. */
export const ShirtColorSchema = z.enum([
  'shirt_blue',
  'shirt_purple',
  'shirt_green',
  'shirt_pink',
  'shirt_honey',
  'shirt_cyan',
  'shirt_coral',
  'shirt_ink',
]);
export type ShirtColor = z.infer<typeof ShirtColorSchema>;

/** Hex maps — single source of truth for swatches + SVG fills (shared component). */
export const SKIN_TONE_HEX: Record<SkinTone, string> = {
  skin_1: '#FCE0C2',
  skin_2: '#F4C7A1',
  skin_3: '#E0A878',
  skin_4: '#C68642',
  skin_5: '#8D5524',
  skin_6: '#5C3A21',
};
export const HAIR_COLOR_HEX: Record<HairColor, string> = {
  hair_black: '#1B1A18',
  hair_brown: '#3A2A1A',
  hair_chestnut: '#6B4423',
  hair_blonde: '#E8B84B',
  hair_ginger: '#B5532A',
  hair_grey: '#B9B4AC',
};
export const SHIRT_COLOR_HEX: Record<ShirtColor, string> = {
  shirt_blue: '#1F6FEB',
  shirt_purple: '#7B2FF7',
  shirt_green: '#3F7A2E',
  shirt_pink: '#D6336C',
  shirt_honey: '#FFB400',
  shirt_cyan: '#2BD4E6',
  shirt_coral: '#FF7E5C',
  shirt_ink: '#20242E',
};

// Hair SHAPE paths on a 100×100 viewBox (face ellipse: cx50 cy56 rx26 ry30).
// `front` is drawn over the face + filled with the hair colour; `back` (optional)
// is drawn BEHIND the face ellipse so long/afro/pigtails/bun frame the head.
// These are the single tweak point for the shapes — edit here, both apps update.
const FRONT_CAP = 'M 24 50 Q 25 26 50 24 Q 75 26 76 50 Q 70 36 50 36 Q 30 36 24 50 Z';
export const HAIR_STYLE_PATHS: Record<HairStyle, { back?: string; front: string }> = {
  style_short: { front: FRONT_CAP },
  style_curly: {
    front:
      'M 23 50 Q 19 33 30 31 Q 31 22 41 27 Q 50 19 59 27 Q 69 22 70 31 Q 81 33 77 50 Q 71 36 50 36 Q 29 36 23 50 Z',
  },
  style_afro: {
    back: 'M 50 14 C 24 14 14 34 18 53 Q 19 61 25 63 Q 22 46 50 44 Q 78 46 75 63 Q 81 61 82 53 C 86 34 76 14 50 14 Z',
    front: FRONT_CAP,
  },
  style_long: {
    back: 'M 21 48 Q 19 30 50 22 Q 81 30 79 48 L 79 86 Q 71 82 69 58 Q 67 40 50 39 Q 33 40 31 58 Q 29 82 21 86 Z',
    front: FRONT_CAP,
  },
  style_pigtails: {
    back: 'M 9 50 A 9 9 0 1 0 27 50 A 9 9 0 1 0 9 50 Z M 73 50 A 9 9 0 1 0 91 50 A 9 9 0 1 0 73 50 Z',
    front: FRONT_CAP,
  },
  style_bun: {
    back: 'M 41 19 A 9 9 0 1 0 59 19 A 9 9 0 1 0 41 19 Z',
    front: FRONT_CAP,
  },
};

/** Ordered palettes for the picker swatches (id + hex). */
export const SKIN_TONES = (Object.keys(SKIN_TONE_HEX) as SkinTone[]).map((id) => ({ id, hex: SKIN_TONE_HEX[id] }));
export const HAIR_COLORS = (Object.keys(HAIR_COLOR_HEX) as HairColor[]).map((id) => ({ id, hex: HAIR_COLOR_HEX[id] }));
export const SHIRT_COLORS = (Object.keys(SHIRT_COLOR_HEX) as ShirtColor[]).map((id) => ({ id, hex: SHIRT_COLOR_HEX[id] }));
export const HAIR_STYLES = Object.keys(HAIR_STYLE_PATHS) as HairStyle[];

/** Maps each legacy avatar id → its recolour equivalent, for backfilling
 *  existing rows. Skin defaults to skin_2 (#F4C7A1, the old single hardcoded
 *  tone); hair/shirt come from the old AVATAR_LOOKS table (Chrome.tsx). */
export const LEGACY_AVATAR_LOOK: Record<
  Avatar,
  { skinTone: SkinTone; hairColor: HairColor; shirtColor: ShirtColor; hairStyle: HairStyle }
> = {
  avatar_1: { skinTone: 'skin_2', hairColor: 'hair_brown', shirtColor: 'shirt_blue', hairStyle: 'style_short' },
  avatar_2: { skinTone: 'skin_2', hairColor: 'hair_blonde', shirtColor: 'shirt_purple', hairStyle: 'style_short' },
  avatar_3: { skinTone: 'skin_2', hairColor: 'hair_black', shirtColor: 'shirt_green', hairStyle: 'style_short' },
  avatar_4: { skinTone: 'skin_2', hairColor: 'hair_ginger', shirtColor: 'shirt_pink', hairStyle: 'style_short' },
};

/** Default look for a brand-new profile before the parent picks. */
export const DEFAULT_AVATAR_LOOK = {
  skinTone: 'skin_2' as SkinTone,
  hairColor: 'hair_brown' as HairColor,
  shirtColor: 'shirt_blue' as ShirtColor,
  hairStyle: 'style_short' as HairStyle,
};

// ─── Session / lesson ────────────────────────────────────────────────────────

/**
 * Why a lesson session started — powers the adherence/volition read (product §13.2).
 * Do not drop this field.
 */
export const LessonTriggerSchema = z.enum(['new', 'retry', 'replay']);
export type LessonTrigger = z.infer<typeof LessonTriggerSchema>;

/** Who initiated a session — set by the parent in the classification queue (product §9.3). */
export const InitiationLabelSchema = z.enum(['child_initiated', 'prompted', 'unsure']);
export type InitiationLabel = z.infer<typeof InitiationLabelSchema>;

// ─── Module-specific enums ───────────────────────────────────────────────────

/** Keyboard typing mode (product §9.2). */
export const TypingModeSchema = z.enum(['static', 'scrolling']);
export type TypingMode = z.infer<typeof TypingModeSchema>;

/** Outcome of a Code run attempt (product §9.2). */
export const CodeRunResultSchema = z.enum(['success', 'hit_wall', 'wrong_position']);
export type CodeRunResult = z.infer<typeof CodeRunResultSchema>;

// ─── Shared numeric primitives ───────────────────────────────────────────────

/** Difficulty tier (1-10). Phase 1 ships a 3-level slice but the schema allows the full range. */
export const LevelSchema = z.number().int().min(1).max(10);
export type Level = z.infer<typeof LevelSchema>;

/** Lesson index within a level: 1-3 are lessons, 4 is the revision (product §4.0). */
export const LessonSchema = z.number().int().min(1).max(4);
export type Lesson = z.infer<typeof LessonSchema>;

/** Difficulty rating of a question within its level (product §5). */
export const DifficultySchema = z.number().int().min(1).max(5);
export type Difficulty = z.infer<typeof DifficultySchema>;

/** Stars awarded (0-3 per lesson is typical; not hard-capped here). */
export const StarsSchema = z.number().int().min(0);
export type Stars = z.infer<typeof StarsSchema>;
