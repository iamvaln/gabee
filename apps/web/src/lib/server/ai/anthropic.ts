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

const AGE_BAND = 'children aged 5 to 10';

function planSystemPrompt(): string {
  return [
    `You are a bilingual (French/English) curriculum designer for Gabee, a learning app for ${AGE_BAND}.`,
    'You draft a single level plan FOR ONE SPECIFIC SUB-MODE of a module: a scope statement, 3 to 5 pedagogical objectives, and validation criteria.',
    'The plan MUST be specific to that sub-mode\'s mechanic — e.g. a Geometry plan is about shapes, sides, symmetry and space, NOT generic number recognition; an Arithmetic plan is about counting and operations. Do not write a generic module plan.',
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
    `Sub-mode (the plan is for THIS sub-mode only): ${input.subModeName.fr} / ${input.subModeName.en} [${input.subMode}]`,
    `Sub-mode mechanic: ${input.subModeMechanic || '(none specified)'}`,
    `Target level: ${input.level} (of 10).`,
    `Module characteristics: ${JSON.stringify(input.characteristics)}`,
    `Write the scope, objectives and validation criteria specifically for the "${input.subModeName.en}" sub-mode at this level.`,
    'Previous-level objectives for this sub-mode (continuity context):',
    prev,
  ].join('\n');
}

/** Words sub-mode short-key → rendering type. Kept typed (not DB-driven) so the
 *  derive-type step in `generateQuestions` stays exhaustive: the kid app already
 *  has matching renderers and these mappings are quality-critical. */
type WordsKey = 'picture' | 'fill-blank' | 'build-sentence' | 'read-answer';

const TYPE_BY_WORDS_SUBMODE: Record<WordsKey, string> = {
  picture: 'mcq-image',
  'fill-blank': 'mcq-word',
  'build-sentence': 'build-sentence',
  'read-answer': 'read-answer',
};

/** Detailed shape guidance per Words sub-mode — content lives in `config`, the
 *  prompt is the instruction (Curriculum v0.1 — docs/gabee-seed-schema-v1.md §3). */
const WORDS_SUBMODE_SHAPE: Record<WordsKey, string> = {
  picture:
    'sub_mode "picture", type "mcq-image": `config.image` is an asset KEY from the allowed vocabulary depicting the answer word (e.g. "fox"). `prompt` is a bilingual INSTRUCTION (e.g. {"fr":"Quel est ce mot ?","en":"What is this word?"}). `answer` and each distractor are bilingual {"fr","en"} single words.',
  'fill-blank':
    'sub_mode "fill-blank", type "mcq-word": `config.sentence` is a bilingual sentence with the placeholder "___" where the target word goes (e.g. {"fr":"Le chat boit du ___.","en":"The cat drinks ___."}). `prompt` is a bilingual instruction (e.g. {"fr":"Choisis le mot qui manque.","en":"Choose the missing word."}). `answer` and each distractor are bilingual {"fr","en"} single words.',
  'build-sentence':
    'sub_mode "build-sentence", type "build-sentence": `answer` is the ordered word ARRAY per language — {"fr":["Maman","lit","."],"en":["Mum","reads","."]} (include the capitalised first word and a final-punctuation token where relevant). `config.tokens` is the SAME words shuffled, {"fr":[...],"en":[...]}. `prompt` is a bilingual instruction. Leave `distractors` empty.',
  'read-answer':
    'sub_mode "read-answer", type "read-answer": `config.passage` is the bilingual passage to read (e.g. {"fr":"Léa a une pomme rouge.","en":"Lea has a red apple."}). `prompt` is the bilingual comprehension QUESTION. `answer` and each distractor are bilingual {"fr","en"} short phrases.',
};

/**
 * Normalise a sub-mode input (registry id like `words.picture` OR the bare key)
 * to the Words key. Returns `null` if it isn't a Words sub-mode.
 */
function toWordsSubModeKey(raw: string | undefined): WordsKey | null {
  if (!raw) return null;
  const key = raw.includes('.') ? raw.split('.').pop() ?? '' : raw;
  return key in TYPE_BY_WORDS_SUBMODE ? (key as WordsKey) : null;
}

/** Words batch guidance — either pinned to one sub-mode or "vary across the 4". */
function wordsSubModeGuidance(pinned: WordsKey | null): string {
  if (pinned) {
    return [
      `EVERY question MUST use sub_mode "${pinned}" with the matching shape:`,
      WORDS_SUBMODE_SHAPE[pinned],
    ].join('\n');
  }
  return [
    'Vary the 4 Words sub-modes EVENLY across the batch. Set sub_mode + type per question per the shapes below:',
    '- ' + WORDS_SUBMODE_SHAPE.picture,
    '- ' + WORDS_SUBMODE_SHAPE['fill-blank'],
    '- ' + WORDS_SUBMODE_SHAPE['build-sentence'],
    '- ' + WORDS_SUBMODE_SHAPE['read-answer'],
  ].join('\n');
}

/**
 * Build the per-batch type + sub-mode rule for the system prompt. Words keeps its
 * typed mapping (4 sub-modes → 4 question types) because each pairing has a distinct
 * renderer + content shape. Other modules use the module-default type and an
 * optional registry hint when a sub-mode is pinned.
 */
/**
 * Code-grid guidance — UNIFIED TURTLE model (Curriculum v0.1 §4, see
 * docs/gabee-seed-schema-v1.md §4). Coordinates are [x,y], origin top-left,
 * x→right, y→down. `answer` is the reference program (op array). The puzzle lives
 * in `config`; `prompt` is a short bilingual instruction.
 */
const CODE_GRID_COMMON = [
  'Each question MUST use type "code-grid":',
  '- prompt: a short bilingual INSTRUCTION (e.g. {"fr":"Programme l’abeille…","en":"Program the bee…"}).',
  '- distractors: [] (empty — Code is not MCQ).',
  '- config.grid = { "w": <cols>, "h": <rows> }; config.start = [x,y]; config.facing = "N"|"E"|"S"|"W".',
  '- Coordinates are [x,y], origin top-left (x→right, y→down).',
  '- answer = the reference program: an array of ops that EXACTLY solves the puzzle. Op vocabulary:',
  '    {"op":"forward"} · {"op":"turn","dir":"left"|"right"} · {"op":"pick"} · {"op":"drop"}',
  '    {"op":"repeat","n":N,"body":[...]} · {"op":"if","cond":"wall_ahead"|"cell_occupied"|"can_pick","then":[...],"else":[...]}',
];
const CODE_WORLD_GUIDE: Record<'maze' | 'draw' | 'actions', string[]> = {
  maze: [
    'World "maze": reach the star, finishing EXACTLY on it (overshooting fails).',
    '- config.goal = [x,y] (one star); config.walls = [[x,y],...].',
    '- blocks: ["forward","turn_left","turn_right"] (+ "if"/"repeat" at higher levels).',
  ],
  draw: [
    'World "draw": trace the target shape EXACTLY (no overshoot or retrace).',
    '- config.target = { "vertices": [[x,y],...] } — a polyline on the grid (use "paths":[[...],[...]] for broken strokes).',
    '- blocks: ["forward","turn_left","turn_right"] (+ "pen_up"/"pen_down","repeat" at higher levels).',
  ],
  actions: [
    'World "actions": pick up each item and drop it on its target.',
    '- config.items = [[x,y],...]; config.targets = [[x,y],...] (items[i] → targets[i]); config.obstacles = [[x,y],...].',
    '- blocks: ["forward","turn_left","turn_right","pick","drop"] (+ "jump","if","repeat" at higher levels).',
  ],
};
function codeGridGuidance(world: 'maze' | 'draw' | 'actions' | null): string {
  const worlds = world ? [world] : (['maze', 'draw', 'actions'] as const);
  return [...CODE_GRID_COMMON, ...worlds.flatMap((w) => CODE_WORLD_GUIDE[w])].join('\n');
}

/** Strip a dotted registry id (`words.picture`) to its bare key (`picture`). */
function bareKey(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.includes('.') ? raw.split('.').pop() ?? null : raw;
}
function codeWorldOf(raw: string | undefined): 'maze' | 'draw' | 'actions' | null {
  const k = bareKey(raw);
  return k === 'maze' || k === 'draw' || k === 'actions' ? k : null;
}

/** Per-module content-shape note (numbers/translation/keyboard) — the content
 *  lives in `config` per the v0.1 contract; the prompt is the instruction. */
const MODULE_SHAPE_NOTE: Record<string, string> = {
  numbers:
    'numbers: `prompt` is the full bilingual question text (e.g. "5 + 0 = ?", "Combien y a-t-il de chats ?"); `answer` is the number (or a bilingual word for parity/comparison). For a counting collection add config {"object":<asset key>,"count":N,"layout":"scatter"}.',
  translation:
    'translation: config.direction = "fr-en"|"en-fr"; config.source is the source-language word/phrase (L1 = a very common single word, up the ladder to expressions/sentences). `prompt` is a bilingual instruction naming the source; `answer` is the TARGET-language string; distractors are plausible target-language strings. Never use images.',
  keyboard:
    'keyboard: config.target is the text to type — a bare string for a single letter/digit/punctuation (lang null), or {"fr","en"} for a word/phrase (lang both); add config.tolerance {"case":bool,"accents":bool}; for "speed" add config.scroll_speed "slow"|"medium"|"fast". `answer` mirrors config.target; `prompt` is a short instruction.',
};

function typeAndSubModeRule(
  input: GenerateQuestionsInput,
  registryHint: string | null,
): string {
  const typeHint = QUESTION_TYPE_BY_MODULE[input.module] ?? 'mcq-number';
  if (input.module === 'words') {
    return wordsSubModeGuidance(toWordsSubModeKey(input.subMode));
  }
  if (input.module === 'code') return codeGridGuidance(codeWorldOf(input.subMode));
  const base = `Each question MUST use type "${typeHint}" and sub_mode "${bareKey(input.subMode) ?? '(per the plan)'}".`;
  const shape = MODULE_SHAPE_NOTE[input.module];
  return [base, shape, registryHint ? `Sub-mode mechanic: ${registryHint}` : null]
    .filter(Boolean)
    .join('\n');
}

function questionsSystemPrompt(input: GenerateQuestionsInput, registryHint: string | null): string {
  const bilingual = LANG_BOTH_MODULES.has(input.module);
  return [
    `You are a bilingual (French/English) question author for Gabee, a learning app for ${AGE_BAND}.`,
    `Generate candidate questions for the "${input.moduleName.en}" module, grounded ONLY in the accepted level plan provided.`,
    // Real-world plausibility — sentences/scenes must be TRUE and natural for a
    // young child. The subject and its action/attribute must fit (a monkey or a
    // cat climbs, a lion does NOT; the sky is blue, not green). No nonsense or
    // surreal pairings, even if grammatically valid.
    'PLAUSIBILITY: every sentence, scene and answer must be factually correct and natural for a young child — the subject must plausibly do the action / have the attribute (e.g. "Le singe grimpe" ✓, "Le lion grimpe" ✗). Reject implausible or surreal pairings even when grammatically valid.',
    typeAndSubModeRule(input, registryHint),
    bilingual
      ? 'Each question is language-DEPENDENT: set "lang":"both" and provide prompt/answer as {"fr","en"} pairs with full parity.'
      : 'Each question is language-AGNOSTIC: set "lang":null and provide prompt/answer as bare strings or numbers (no {fr,en}).',
    'Provide at least 2 plausible distractors per question where the type uses choices.',
    'difficulty is an integer 1-5. theme is a short kebab-case tag. objective_ref references one of the plan objectives (its 1-based index as a string) or null.',
    // Self-verification — the admin reviews candidates, but every answer must be
    // provably correct first. Catches the common failure (a plausible-looking but
    // wrong answer or an unsolvable code puzzle) before it reaches the queue.
    'VERIFY EVERY ANSWER before emitting it: re-solve the item yourself and confirm the answer is unambiguously correct and that no distractor is also correct. For "code-grid", mentally SIMULATE your `answer` program step by step on the grid and confirm it solves the puzzle exactly (maze: finishes on the star without hitting a wall; draw: traces the shape with no overshoot/retrace; actions: each item ends on its target, hands empty). Discard or fix any question whose answer you cannot confirm. Never emit an unverified or unsolvable question.',
    // Hint authoring rules — one per question, mirrors the question\'s lang
    // stance, never reveals the answer. Module-specific style guidance below.
    'Every question MUST include a "hint" — a SINGLE short sentence (≤80 characters per language) that nudges the kid toward the answer WITHOUT revealing it.',
    'The hint should evoke an associated idea, a concrete clue, or a simple step. It must NEVER restate the answer, the prompt, or any distractor verbatim.',
    'Tone: warm, encouraging, addressed to a 5-10 year old (tutoie en français).',
    bilingual
      ? 'When "lang":"both", "hint" is bilingual {"fr","en"} with full parity.'
      : 'When "lang":null, "hint" is a bare string.',
    `Hint style for this module: ${hintStyleFor(input.module, input.subMode)}`,
    'Respond with ONLY a JSON array, no prose, no markdown fences. Each element:',
    '{"type":"...","sub_mode":"<the batch sub_mode key>","lang":"both"|null,"prompt":...,"answer":...,"distractors":[...],"config":{...},"hint":...,"difficulty":1-5,"theme":"...","objective_ref":"1"|null,"concept_tags":["..."]}',
  ].join('\n');
}

// Module-specific hint guidance. Picked into the system prompt so the model
// adopts the right register per mechanic. Sub-mode-aware where the mechanic
// changes the kind of help that\'s useful (Numbers arithmetic vs geometry,
// each Words sub-mode).
function hintStyleFor(module: string, subMode: string | undefined): string {
  const key = bareKey(subMode) ?? '';
  if (module === 'numbers') {
    if (key === 'counting') return 'Counting — invite counting one by one or by groups ("Compte-les un par un" / "Count them one by one"). Never give the number.';
    if (key === 'comparison') return 'Comparison — point to which group/number is bigger or to the rule ("Regarde lequel en a le plus" / "Look at which has more"). Never give the answer.';
    if (key === 'word-problems') return 'Word problems — name the operation hidden in the story ("On ajoute ou on retire ?" / "Are we adding or taking away?"). Never give the result.';
    return 'Operations — decompose the calculation or point to a landmark number ("Commence par 10 + 5, puis ajoute" / "Start with 10 + 5, then add the rest"). Never give the result.';
  }
  if (module === 'words') {
    if (key === 'picture') return 'Words/picture — evoke the category or a characteristic of the depicted thing ("C\'est le roi de la jungle" / "It\'s the king of the jungle"). Never name the word.';
    if (key === 'fill-blank') return 'Words/fill-blank — point at the GRAMMATICAL nature or sense of the missing word ("C\'est une action" / "It\'s an action word"). Never give the word.';
    if (key === 'build-sentence') return 'Words/build-sentence — name what comes first or who acts ("Commence par qui fait l\'action" / "Start with who does the action").';
    if (key === 'read-answer') return 'Words/read-answer — direct attention to the relevant part of the passage ("La réponse est dans la 2e phrase" / "The answer is in the second sentence"). Never quote it.';
    return 'Words — give a category or grammatical clue. Never reveal the target word.';
  }
  if (module === 'keyboard') return 'Keyboard — locate the next key by row or finger ("Sur la rangée du milieu, main gauche" / "Middle row, left hand"). Never spell the answer.';
  if (module === 'code') return 'Code — indicate the heading of the next step or the first block to place ("D\'abord avance, puis tourne à droite" / "First go forward, then turn right"). Never give the full sequence.';
  if (module === 'translation') return 'Translation — evoke the root, a cognate, or context ("Comme « animal » en anglais" / "Same root as the French word"). Never give the translation.';
  return 'Give a single helpful clue that nudges without revealing.';
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
// Modules generated bilingually ({fr,en} with parity). Curriculum v0.1: the Code
// prompt is a bilingual INSTRUCTION (the puzzle itself lives in config), so Code
// joins the bilingual set. Truly language-agnostic items (e.g. a typed letter)
// still set lang:null per the per-item shape note.
const LANG_BOTH_MODULES = new Set(['words', 'translation', 'numbers', 'keyboard', 'code']);

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
 * Curriculum v0.1: a `build-sentence` answer is the ordered word ARRAY per language
 * (`{"fr":["Maman","lit","."],"en":[...]}`). The model sometimes emits a single
 * string instead — split it into word tokens so the row matches the contract.
 * Recurses into bilingual `{fr,en}`; arrays and other shapes pass through.
 */
function coerceToWordArrays(v: unknown): unknown {
  if (typeof v === 'string') return v.trim().split(/\s+/).filter(Boolean);
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = coerceToWordArrays(val);
    }
    return out;
  }
  return v;
}

/**
 * Curriculum v0.1 code-grid shape: `prompt` is a bilingual instruction, `answer`
 * is the reference program (op array), `distractors` is empty, and the puzzle
 * lives in `config`. Defensive only — ensure distractors is empty and config is an
 * object; leave the (validated downstream) prompt/answer as the model produced.
 */
function coerceCodeGrid(q: Partial<DraftedQuestion>): {
  prompt: unknown;
  answer: unknown;
  distractors: unknown[];
  config: unknown;
} {
  const cfgIn = (q as { config?: unknown }).config;
  const config =
    cfgIn && typeof cfgIn === 'object' && !Array.isArray(cfgIn) ? cfgIn : {};
  return { prompt: q.prompt, answer: q.answer, distractors: [], config };
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
      // build-sentence: the answer is the ordered word ARRAY per language; coerce a
      // stray string into word tokens. The prompt stays the instruction.
      let prompt: unknown = q.prompt;
      let answer: unknown = type === 'build-sentence' ? coerceToWordArrays(q.answer) : q.answer;
      let distractors: unknown[] = Array.isArray(q.distractors) ? q.distractors : [];
      let config: unknown = q.config;
      // code-grid: ensure empty distractors + object config (puzzle lives in config).
      if (type === 'code-grid') {
        const coerced = coerceCodeGrid(q);
        prompt = coerced.prompt;
        answer = coerced.answer;
        distractors = coerced.distractors;
        config = coerced.config;
      }
      // Hint is required in the prompt but the model occasionally drops it
      // (especially under thinking-budget pressure). We pass it through
      // verbatim when present — admins can edit it in the pool view — and
      // leave it undefined when missing so the column stays NULL rather
      // than getting filled with a brittle auto-generated fallback.
      const hint: unknown = q.hint === null ? undefined : q.hint;
      return {
        type,
        lang: q.lang === 'both' ? 'both' : null,
        prompt,
        answer,
        distractors,
        hint,
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
