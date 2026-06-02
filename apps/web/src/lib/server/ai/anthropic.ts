import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db';
import { HttpError } from '../http';
import type {
  AiProvider,
  DraftedPlan,
  DraftedQuestion,
  GenerateQuestionsInput,
  GenerateQuestionsResult,
  StreamPlanInput,
} from './provider';

/** Default model for content authoring — Opus 4.8 (most capable). */
const MODEL = 'claude-opus-4-8';

// Opus 4.8 pricing per 1M tokens (input / output) — for the aiUsage cost rollup.
// (Same per-token rates as 4.7.)
const INPUT_USD_PER_TOKEN = 5 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 25 / 1_000_000;

function costUsd(inputTokens: number, outputTokens: number): number {
  return inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
}

/**
 * Resolve the SDK client, or fail loudly when the key is absent so the app still
 * builds/typechecks and the UI surfaces a clean 503 (brief).
 */
function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, 'ai_unavailable', 'Set ANTHROPIC_API_KEY to use AI authoring');
  }
  return new Anthropic({ apiKey });
}

async function recordUsage(
  purpose: 'plan_generation' | 'question_generation',
  inputTokens: number,
  outputTokens: number,
  actorId: string,
): Promise<void> {
  await prisma.aiUsage.create({
    data: {
      provider: 'anthropic',
      model: MODEL,
      purpose,
      inputTokens,
      outputTokens,
      costUsd: costUsd(inputTokens, outputTokens),
      actorId,
    },
  });
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

const AGE_BAND = 'children aged 6 to 8';

function planSystemPrompt(): string {
  return [
    `You are a bilingual (French/English) curriculum designer for Gabee, a learning app for ${AGE_BAND}.`,
    'You draft a single level plan: a scope statement, 3 to 5 pedagogical objectives, and validation criteria.',
    'Everything must be age-appropriate, concrete, and bilingual with strict FR/EN parity (every field present in both languages).',
    'Build on the previous levels (continuity) without repeating them. Ground the plan in the module characteristics.',
    'Respond with ONLY a JSON object, no prose, no markdown fences, matching exactly:',
    '{"scope":{"fr":"...","en":"..."},"objectives":[{"fr":"...","en":"..."}],"validation":{"fr":"...","en":"..."}}',
  ].join('\n');
}

function planUserPrompt(input: StreamPlanInput): string {
  const prev = input.prevContext.length
    ? input.prevContext
        .map(
          (c) =>
            `Level ${c.level}: ${c.objectives.map((o) => `${o.fr} / ${o.en}`).join('; ')}`,
        )
        .join('\n')
    : 'None — this is the first level.';
  return [
    `Module: ${input.moduleName.fr} / ${input.moduleName.en}`,
    `Target level: ${input.level} (of 10).`,
    `Module characteristics: ${JSON.stringify(input.characteristics)}`,
    'Previous-level objectives (continuity context):',
    prev,
  ].join('\n');
}

/** Words sub-mode short-key → rendering type. Kept typed (not DB-driven) so the
 *  derive-type step in `generateQuestions` stays exhaustive: the kid app already
 *  has matching renderers and these mappings are quality-critical. */
const TYPE_BY_WORDS_SUBMODE: Record<'picture' | 'fill' | 'build' | 'read', string> = {
  picture: 'mcq-image',
  fill: 'mcq-word',
  build: 'build-sentence',
  read: 'read-answer',
};

/** Detailed shape guidance per Words sub-mode — quality-critical, hand-tuned. */
const WORDS_SUBMODE_SHAPE: Record<'picture' | 'fill' | 'build' | 'read', string> = {
  picture:
    'sub_mode "picture", type "mcq-image": `prompt` is a single emoji depicting the answer word (same emoji in fr and en — e.g. {"fr":"🦊","en":"🦊"}). `answer` and each distractor are bilingual {"fr","en"} single words.',
  fill:
    'sub_mode "fill", type "mcq-word": `prompt` is a bilingual sentence with the placeholder "___" where the target word goes (e.g. {"fr":"Le chat boit du ___.","en":"The cat drinks ___."}). `answer` and each distractor are bilingual {"fr","en"} single words.',
  build:
    'sub_mode "build", type "build-sentence": `answer` is the target sentence as a SINGLE BILINGUAL STRING (NEVER an array of words and NEVER with a trailing period) — e.g. {"fr":"Le chat dort sur le canapé","en":"The cat sleeps on the sofa"}. `prompt` is a short bilingual instruction (e.g. {"fr":"Remets les mots dans l\'ordre.","en":"Put the words in order."}). Leave `distractors` empty.',
  read:
    'sub_mode "read", type "read-answer": `prompt` is bilingual passage followed by a literal "\\n" and then the comprehension question — e.g. {"fr":"Léa a une pomme rouge.\\nQuelle est la couleur de la pomme ?","en":"Lea has a red apple.\\nWhat colour is the apple?"}. `answer` and each distractor are bilingual {"fr","en"} short phrases.',
};

/**
 * Normalise a sub-mode input (registry id like `words.picture` OR legacy short key
 * like `picture`) to the short key — the form Words renderers + back-compat shims
 * use. Returns `null` if the input doesn't look like a Words sub-mode.
 */
function toWordsSubModeKey(raw: string | undefined): 'picture' | 'fill' | 'build' | 'read' | null {
  if (!raw) return null;
  const key = raw.includes('.') ? raw.split('.').pop() ?? '' : raw;
  return key in TYPE_BY_WORDS_SUBMODE
    ? (key as 'picture' | 'fill' | 'build' | 'read')
    : null;
}

/** Words batch guidance — either pinned to one sub-mode or "vary across the 4". */
function wordsSubModeGuidance(pinned: 'picture' | 'fill' | 'build' | 'read' | null): string {
  if (pinned) {
    return [
      `EVERY question MUST use sub_mode "${pinned}" with the matching shape:`,
      WORDS_SUBMODE_SHAPE[pinned],
    ].join('\n');
  }
  return [
    'Vary the 4 Words sub-modes EVENLY across the batch. Set sub_mode + type per question per the shapes below:',
    '- ' + WORDS_SUBMODE_SHAPE.picture,
    '- ' + WORDS_SUBMODE_SHAPE.fill,
    '- ' + WORDS_SUBMODE_SHAPE.build,
    '- ' + WORDS_SUBMODE_SHAPE.read,
  ].join('\n');
}

/**
 * Build the per-batch type + sub-mode rule for the system prompt. Words keeps its
 * typed mapping (4 sub-modes → 4 question types) because each pairing has a distinct
 * renderer + content shape. Other modules use the module-default type and an
 * optional registry hint when a sub-mode is pinned.
 */
/** Code-grid canonical shape (seed §code-l1-l1-001). The kid app renders the grid
 *  from `config`; `prompt`/`answer`/`distractors` are flat metadata. */
const CODE_GRID_GUIDE = [
  'Each question MUST use type "code-grid" with this EXACT shape:',
  '- prompt: a NUMBER = the optimal block count (e.g. 2, 4, 6). NEVER an object or array.',
  '- answer: the literal STRING "★" — it represents the goal the bee must reach. ALWAYS exactly this character, never a sequence.',
  '- distractors: [] (empty array — Code is not MCQ).',
  '- lang: null (Code is language-agnostic).',
  '- config: an OBJECT describing the puzzle:',
  '  { "grid": { "cols": 5, "rows": 5 },',
  '    "start": { "x": 0, "y": 4 },',
  '    "goals": [ { "x": 2, "y": 4 } ],',
  '    "obstacles": [ { "x": 1, "y": 3 } ],',
  '    "optimal_blocks": 2,',
  '    "optimal_program": ["right", "right"] }',
  '  • grid.cols/rows: integers, typically 5×5 at L1-3 up to 7×7+ at L8+.',
  '  • start, goals[i], obstacles[i]: cells {x,y} with 0 ≤ x < cols and 0 ≤ y < rows.',
  '  • optimal_program: a sequence of move tokens. Valid tokens depend on sub-mode:',
  '      - sub_mode "find_path": "up", "down", "left", "right".',
  '      - sub_mode "building_blocks": those plus "loop_start"/"loop_end" with an optional repeat count, "if_obstacle", etc.',
  '  • optimal_blocks: a number equal to the count of TOP-LEVEL blocks in optimal_program (count a loop as ONE block).',
].join('\n');

function typeAndSubModeRule(
  input: GenerateQuestionsInput,
  registryHint: string | null,
): string {
  const typeHint = QUESTION_TYPE_BY_MODULE[input.module] ?? 'mcq-number';
  if (input.module === 'words') {
    return wordsSubModeGuidance(toWordsSubModeKey(input.subMode));
  }
  if (input.module === 'code') return CODE_GRID_GUIDE;
  const base = `Each question MUST use type "${typeHint}". Leave sub_mode null/absent.`;
  return registryHint
    ? `${base}\nSub-mode mechanic for this batch: ${registryHint}`
    : base;
}

function questionsSystemPrompt(input: GenerateQuestionsInput, registryHint: string | null): string {
  const bilingual = LANG_BOTH_MODULES.has(input.module);
  return [
    `You are a bilingual (French/English) question author for Gabee, a learning app for ${AGE_BAND}.`,
    `Generate candidate questions for the "${input.moduleName.en}" module, grounded ONLY in the accepted level plan provided.`,
    typeAndSubModeRule(input, registryHint),
    bilingual
      ? 'Each question is language-DEPENDENT: set "lang":"both" and provide prompt/answer as {"fr","en"} pairs with full parity.'
      : 'Each question is language-AGNOSTIC: set "lang":null and provide prompt/answer as bare strings or numbers (no {fr,en}).',
    'Provide at least 2 plausible distractors per question where the type uses choices.',
    'difficulty is an integer 1-5. theme is a short kebab-case tag. objective_ref references one of the plan objectives (its 1-based index as a string) or null.',
    'Respond with ONLY a JSON array, no prose, no markdown fences. Each element:',
    '{"type":"...","sub_mode":"picture|fill|build|read|null","lang":"both"|null,"prompt":...,"answer":...,"distractors":[...],"difficulty":1-5,"theme":"...","objective_ref":"1"|null,"concept_tags":["..."]}',
  ].join('\n');
}

/**
 * Look up the active sub-mode's mechanic hint from the DB registry (Phase 2A).
 * Accepts either the dotted registry id (`words.picture`) or the legacy short key
 * (`picture`), pairing it with `input.module` to resolve. Returns null for Words
 * (its prompt has dedicated shape guidance) and when no row matches.
 */
async function loadMechanicHint(input: GenerateQuestionsInput): Promise<string | null> {
  if (input.module === 'words' || !input.subMode) return null;
  const key = input.subMode.includes('.') ? input.subMode.split('.').pop() ?? '' : input.subMode;
  if (!key) return null;
  const row = await prisma.subMode.findUnique({
    where: { module_key: { module: input.module, key } },
    select: { mechanicHint: true },
  });
  return row?.mechanicHint ?? null;
}

function questionsUserPrompt(input: GenerateQuestionsInput): string {
  const objectives = input.objectives
    .map((o, i) => `${i + 1}. ${o.fr} / ${o.en}`)
    .join('\n');
  const diff = {
    easier: 'Skew easier than the plan baseline.',
    as_planned: 'Match the plan difficulty.',
    harder: 'Skew harder than the plan baseline.',
  }[input.difficultyHint];
  return [
    `Level ${input.level} scope: ${input.scope.fr} / ${input.scope.en}`,
    'Objectives:',
    objectives,
    `Validation criteria: ${input.validationCriteria.fr} / ${input.validationCriteria.en}`,
    `Generate ${input.batchSize} distinct candidate questions. ${diff}`,
    input.themes ? `Themes to favor/avoid: ${input.themes}` : '',
    input.instructions ? `Additional instructions: ${input.instructions}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Module → rendering type (mirrors the seeded content + question enum). */
const QUESTION_TYPE_BY_MODULE: Record<string, string> = {
  numbers: 'mcq-number',
  words: 'mcq-word',
  keyboard: 'typing',
  code: 'code-grid',
  translation: 'translation',
};
// Modules whose questions carry natural-language text → generated bilingually
// ({fr,en} with parity). Everything EXCEPT `code` (whose puzzles are symbolic —
// grids/blocks, prompt is just "★" — and are genuinely language-agnostic).
const LANG_BOTH_MODULES = new Set(['words', 'translation', 'numbers', 'keyboard']);

// ─── Parsing helpers ─────────────────────────────────────────────────────────

/** Strip optional ```json fences and parse, throwing a clean 502 on garbage. */
function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new HttpError(502, 'ai_bad_output', 'AI returned malformed content');
  }
}

/**
 * Defensive: the model occasionally returns `build-sentence` answers as arrays of
 * words (e.g. `{"fr":["Le","chat","dort"]}`) instead of the bilingual single string
 * the kid app + contracts expect. Join with spaces so the row passes Zod validation
 * downstream. Recurses into bilingual `{fr,en}` shapes; pass-through for anything else.
 */
function coerceWordsArrays(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(' ');
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = coerceWordsArrays(val);
    }
    return out;
  }
  return v;
}

/**
 * Code-grid canonical shape per the seed: `prompt` is the optimal-block count
 * (number), `answer` is the literal goal marker `"★"`, `distractors` is empty,
 * and the puzzle definition lives in `config`. The AI commonly drifts (returns
 * the move sequence as `answer`) — pull it back into config + reset `answer`.
 */
function coerceCodeGrid(q: Partial<DraftedQuestion>): {
  prompt: unknown;
  answer: unknown;
  distractors: unknown[];
  config: unknown;
} {
  const cfgIn = (q as { config?: unknown }).config;
  let config: Record<string, unknown> | undefined =
    cfgIn && typeof cfgIn === 'object' && !Array.isArray(cfgIn)
      ? { ...(cfgIn as Record<string, unknown>) }
      : undefined;

  // Answer drifted into an array? It's the move sequence — relocate to config.
  let answer: unknown = q.answer;
  if (Array.isArray(answer)) {
    config = config ?? {};
    if (!config.optimal_program) config.optimal_program = answer;
    answer = '★';
  } else if (typeof answer !== 'string') {
    answer = '★';
  }

  // Prompt should be the optimal_blocks count. If the AI shoved an object/string
  // in there, prefer the number from config; fall back to a small default.
  let prompt: unknown = q.prompt;
  if (typeof prompt !== 'number') {
    const opt = config?.optimal_blocks;
    const program = config?.optimal_program;
    if (typeof opt === 'number') prompt = opt;
    else if (Array.isArray(program)) prompt = program.length;
    else prompt = 2;
  }

  // distractors aren't used for code-grid; ensure empty array.
  return { prompt, answer, distractors: [], config };
}

// ─── Provider implementation ───────────────────────────────────────────────

class AnthropicProvider implements AiProvider {
  async *streamPlan(input: StreamPlanInput): AsyncIterable<string> {
    const anthropic = client();
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: planSystemPrompt(),
      messages: [{ role: 'user', content: planUserPrompt(input) }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }

    const final = await stream.finalMessage();
    input.onUsage?.({
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
    });
    await recordUsage(
      'plan_generation',
      final.usage.input_tokens,
      final.usage.output_tokens,
      input.actorId,
    );
  }

  parsePlan(streamed: string): DraftedPlan {
    const data = parseJson(streamed) as {
      scope?: { fr?: string; en?: string };
      objectives?: { fr?: string; en?: string }[];
      validation?: { fr?: string; en?: string };
    };
    return {
      scope: { fr: data.scope?.fr ?? '', en: data.scope?.en ?? '' },
      pedagogical_objectives: (data.objectives ?? []).map((o) => ({
        fr: o.fr ?? '',
        en: o.en ?? '',
      })),
      validation_criteria: { fr: data.validation?.fr ?? '', en: data.validation?.en ?? '' },
    };
  }

  async generateQuestions(input: GenerateQuestionsInput): Promise<GenerateQuestionsResult> {
    const anthropic = client();
    const registryHint = await loadMechanicHint(input);
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: questionsSystemPrompt(input, registryHint),
      messages: [{ role: 'user', content: questionsUserPrompt(input) }],
    });

    const message = await stream.finalMessage();
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const parsed = parseJson(text);
    const rows = Array.isArray(parsed) ? parsed : [];
    // Pinned sub-mode wins; fall back to whatever the AI emitted, then to the
    // module's default sub-mode short key (the persistence layer normalises).
    const pinnedWordsKey = toWordsSubModeKey(input.subMode);
    const questions: DraftedQuestion[] = rows.map((r) => {
      const q = r as Partial<DraftedQuestion> & { config?: unknown };
      const aiKey = typeof q.sub_mode === 'string' ? q.sub_mode : undefined;
      const subMode = input.subMode ?? aiKey;
      // For Words, derive type from the sub-mode short key (AI occasionally mismatches).
      const wordsKey = input.module === 'words' ? pinnedWordsKey ?? toWordsSubModeKey(aiKey) : null;
      const type =
        wordsKey
          ? TYPE_BY_WORDS_SUBMODE[wordsKey]
          : (q.type ?? QUESTION_TYPE_BY_MODULE[input.module] ?? 'mcq-number');
      // build-sentence: AI occasionally emits arrays of words — coerce to a single
      // space-joined string (the kid app + contracts expect a string).
      let prompt: unknown = type === 'build-sentence' ? coerceWordsArrays(q.prompt) : q.prompt;
      let answer: unknown = type === 'build-sentence' ? coerceWordsArrays(q.answer) : q.answer;
      let distractors: unknown[] = Array.isArray(q.distractors) ? q.distractors : [];
      let config: unknown = q.config;
      // code-grid: AI drifts (returns move sequence as answer) — normalise to seed shape.
      if (type === 'code-grid') {
        const coerced = coerceCodeGrid(q);
        prompt = coerced.prompt;
        answer = coerced.answer;
        distractors = coerced.distractors;
        config = coerced.config;
      }
      return {
        type,
        lang: q.lang === 'both' ? 'both' : null,
        prompt,
        answer,
        distractors,
        difficulty: typeof q.difficulty === 'number' ? q.difficulty : 2,
        theme: q.theme ?? 'general',
        objective_ref: q.objective_ref ?? null,
        sub_mode: subMode,
        concept_tags: Array.isArray(q.concept_tags) ? q.concept_tags : [],
        config,
      };
    });

    await recordUsage(
      'question_generation',
      message.usage.input_tokens,
      message.usage.output_tokens,
      input.actorId,
    );

    return {
      questions,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }
}

export function createAnthropicProvider(): AiProvider {
  return new AnthropicProvider();
}
