import type { Module, Level, BilingualText } from '@gabee/types';

/**
 * AI provider contract for content authoring (admin spec §6). Two operations:
 * `streamPlan` streams a bilingual level plan as text chunks; `generateQuestions`
 * drafts a batch of module-appropriate candidate questions. Every call records token
 * usage via prisma.aiUsage (see anthropic.ts), so the actor id rides on the inputs.
 */

/** A previous level's accepted objectives, fed in as continuity context. */
export interface PrevLevelContext {
  level: Level;
  objectives: BilingualText[];
}

/** Inputs for streaming a level plan (C2 "Generate with AI"). */
export interface StreamPlanInput {
  module: Module;
  level: Level;
  /** Sub-mode this plan is for (short key) + display name + mechanic hint, so the
   *  plan is specific to e.g. Geometry vs Arithmetic — not a generic module plan. */
  subMode: string;
  subModeName: BilingualText;
  subModeMechanic: string;
  /** Module ops metadata (input methods, voiceover, sub-modes) for grounding. */
  moduleName: BilingualText;
  characteristics: unknown;
  /** Accepted objectives from prior levels (continuity). Empty for level 1. */
  prevContext: PrevLevelContext[];
  /** The admin acting; used for the aiUsage audit row. */
  actorId: string;
  /** Callback receiving the final token usage once the stream completes — so the
   *  caller can persist real token counts into ContentPlan.ai_meta. */
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}

/** A bilingual plan parsed out of the streamed draft (status → ai_draft on save). */
export interface DraftedPlan {
  scope: BilingualText;
  pedagogical_objectives: BilingualText[];
  validation_criteria: BilingualText;
}

/** Inputs for a question-generation batch (C4 modal). */
export interface GenerateQuestionsInput {
  module: Module;
  level: Level;
  moduleName: BilingualText;
  characteristics: unknown;
  /** The level's accepted plan — questions must be grounded in it. */
  scope: BilingualText;
  objectives: BilingualText[];
  validationCriteria: BilingualText;
  batchSize: number;
  difficultyHint: 'easier' | 'as_planned' | 'harder';
  themes?: string;
  instructions?: string;
  /**
   * Sub-mode pin (Phase 2A): the SubMode registry id (`words.picture`) or the legacy
   * short key (`picture`). When set, every question is generated for this sub-mode
   * with the matching `type` (Words). When omitted on Words, the AI varies across
   * the four Words sub-modes; other modules persist their module-default sub-mode.
   */
  subMode?: string;
  actorId: string;
}

/** A single drafted question, shaped for insertion as a `candidate` Question row. */
export interface DraftedQuestion {
  /** Rendering type; must be module-appropriate (e.g. 'mcq-number' for numbers). */
  type: string;
  /** null = language-agnostic; 'both' = bilingual (FR+EN present). */
  lang: 'both' | null;
  prompt: unknown;
  answer: unknown;
  distractors: unknown[];
  /** Short encouragement shown after a wrong attempt — nudges without
   *  revealing. Bilingual {fr,en} when `lang === 'both'`, bare otherwise. */
  hint?: unknown;
  difficulty: number;
  theme: string;
  objective_ref: string | null;
  sub_mode?: string;
  concept_tags: string[];
  /** Free-form per-type payload (e.g. Code grid puzzles use this for grid/start/
   *  goals/obstacles/optimal_program; null for simple MCQ types). */
  config?: unknown;
}

export interface GenerateQuestionsResult {
  questions: DraftedQuestion[];
  inputTokens: number;
  outputTokens: number;
}

export interface AiProvider {
  /** Stream the bilingual plan draft as text chunks (for the live editor). */
  streamPlan(input: StreamPlanInput): AsyncIterable<string>;
  /** Parse a completed plan stream back into structured bilingual fields. */
  parsePlan(streamed: string): DraftedPlan;
  /** Draft a batch of candidate questions grounded in the accepted plan. */
  generateQuestions(input: GenerateQuestionsInput): Promise<GenerateQuestionsResult>;
}
