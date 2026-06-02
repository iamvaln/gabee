import { Prisma } from '@gabee/db';
import {
  ContentMatrixResponseSchema,
  PlanResponseSchema,
  PoolResponseSchema,
  ContentPlanSchema,
  AdminQuestionSchema,
  type ContentMatrixResponse,
  type PlanResponse,
  type PoolResponse,
  type ContentPlan,
  type AdminQuestion,
  type Module,
  type Level,
  type BilingualText,
  type SavePlanRequest,
  type GenerateQuestionsRequest,
  type ReviewQuestionRequest,
  type ConfirmPoolResponse,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { getDefaultCurriculumId, POOL_TARGET } from '../admin';
import { getAiProvider } from '../ai';
import type { DraftedQuestion } from '../ai/provider';

// Modules render top-to-bottom in the matrix in this fixed order (admin spec §5).
const MODULE_ORDER: Module[] = ['numbers', 'words', 'keyboard', 'code', 'translation'];
const LEVELS: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Lesson 1 owns the level pool; revision (4) samples across lessons (product §4.0). */
const POOL_LESSON = 1;

/**
 * Per-module default sub-mode short key (Phase 2A) — used to tag generated
 * candidates when the request didn't pin one and the AI didn't emit one. Mirrors
 * the migration backfill so the seed + AI + manual content all converge on the
 * same `(module, sub_mode)` slots.
 */
const DEFAULT_SUBMODE_BY_MODULE: Record<Module, string> = {
  numbers: 'arithmetic',
  words: 'picture',
  keyboard: 'static',
  code: 'find_path',
  translation: 'default',
};

const WORDS_SUBMODE_KEYS = new Set(['picture', 'fill', 'build', 'read']);

/** Normalise a sub-mode input (dotted id like `words.picture`, short key like
 *  `picture`, or undefined) to the persistence form: the short key for Words
 *  (kid-app back-compat), the module's default sub-mode otherwise. */
function normalizeSubModeForPersist(module: Module, raw: string | undefined): string {
  if (raw) {
    const key = raw.includes('.') ? raw.split('.').pop() ?? '' : raw;
    if (module === 'words') {
      return WORDS_SUBMODE_KEYS.has(key) ? key : DEFAULT_SUBMODE_BY_MODULE.words;
    }
    if (key) return key;
  }
  return DEFAULT_SUBMODE_BY_MODULE[module];
}

// ─── Mapping helpers ─────────────────────────────────────────────────────────

type PlanRow = {
  id: string;
  moduleId: string;
  subMode: string;
  level: number;
  scope: unknown;
  pedagogicalObjectives: unknown;
  validationCriteria: unknown;
  notes: string | null;
  status: string;
  aiMeta: unknown;
  acceptedBy: string | null;
  acceptedAt: Date | null;
};

function asBilingual(value: unknown): BilingualText {
  const v = (value ?? {}) as { fr?: unknown; en?: unknown };
  return { fr: typeof v.fr === 'string' ? v.fr : '', en: typeof v.en === 'string' ? v.en : '' };
}

function asBilingualArray(value: unknown): BilingualText[] {
  return Array.isArray(value) ? value.map(asBilingual) : [];
}

function mapPlan(row: PlanRow): ContentPlan {
  return ContentPlanSchema.parse({
    id: row.id,
    module: row.moduleId,
    sub_mode: row.subMode,
    level: row.level,
    scope: asBilingual(row.scope),
    pedagogical_objectives: asBilingualArray(row.pedagogicalObjectives),
    validation_criteria: asBilingual(row.validationCriteria),
    notes: row.notes,
    status: row.status,
    ai_meta: row.aiMeta ?? null,
    accepted_by: row.acceptedBy,
    accepted_at: row.acceptedAt ? row.acceptedAt.toISOString() : null,
  });
}

type QuestionRow = {
  id: string;
  module: string;
  subMode: string;
  level: number;
  lesson: number;
  type: string;
  objectiveRef: string | null;
  prompt: unknown;
  answer: unknown;
  distractors: unknown;
  difficulty: number;
  lang: string | null;
  ratings: unknown;
  avgRating: number | null;
  status: string;
};

/** Per-language rating rollup, derived from the question's ratings JSON array. */
function ratingRollup(ratings: unknown): {
  fr: { score: number; count: number };
  en: { score: number; count: number };
} {
  const rows = Array.isArray(ratings) ? ratings : [];
  const agg = (lang: 'fr' | 'en') => {
    const scored = rows.filter(
      (r): r is { score: number } =>
        !!r && typeof (r as { score?: unknown }).score === 'number' && (r as { lang?: unknown }).lang === lang,
    );
    const count = scored.length;
    const score = count ? scored.reduce((s, r) => s + r.score, 0) / count : 0;
    return { score, count };
  };
  return { fr: agg('fr'), en: agg('en') };
}

function mapAdminQuestion(row: QuestionRow): AdminQuestion {
  const ratings = ratingRollup(row.ratings);
  return AdminQuestionSchema.parse({
    id: row.id,
    module: row.module,
    sub_mode: row.subMode || undefined,
    level: row.level,
    lesson: row.lesson,
    type: row.type,
    objective_ref: row.objectiveRef,
    prompt: row.prompt,
    answer: row.answer,
    distractors: row.distractors,
    difficulty: row.difficulty,
    lang: row.lang === 'both' ? 'both' : null,
    ratings,
    status: row.status,
  });
}

/**
 * Read-tolerant variant: returns `null` for rows that don't validate (e.g. AI
 * candidates persisted before a shape coerce was added). The pool view skips
 * them instead of 500ing the whole page; cleanup happens admin-side.
 */
function tryMapAdminQuestion(row: QuestionRow): AdminQuestion | null {
  try {
    return mapAdminQuestion(row);
  } catch (err) {
    console.warn('[admin-content] skipping malformed question row', row.id, err);
    return null;
  }
}

// ─── C1 · Content matrix ─────────────────────────────────────────────────────

export async function getContentMatrix(): Promise<ContentMatrixResponse> {
  const curriculumId = await getDefaultCurriculumId();

  const [modules, subModes, plans, confirmedCounts] = await Promise.all([
    prisma.moduleDef.findMany({ select: { id: true, slug: true, name: true } }),
    prisma.subMode.findMany({
      select: { module: true, key: true, name: true, displayOrder: true },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.contentPlan.findMany({
      where: { curriculumId },
      select: { moduleId: true, subMode: true, level: true, status: true },
    }),
    prisma.question.groupBy({
      by: ['module', 'subMode', 'level'],
      where: { curriculumId, status: 'confirmed' },
      _count: { _all: true },
    }),
  ]);

  const planByKey = new Map(plans.map((p) => [`${p.moduleId}:${p.subMode}:${p.level}`, p.status]));
  const confirmedByKey = new Map(
    confirmedCounts.map((c) => [`${c.module}:${c.subMode}:${c.level}`, c._count._all]),
  );
  const moduleByName = new Map(modules.map((m) => [m.id, m]));
  // Sub-modes per module, in display order. Every module has ≥1 (translation = "default").
  const subModesByModule = new Map<string, { key: string; name: unknown }[]>();
  for (const sm of subModes) {
    const arr = subModesByModule.get(sm.module) ?? [];
    arr.push({ key: sm.key, name: sm.name });
    subModesByModule.set(sm.module, arr);
  }

  // One row per (module, sub_mode) — mirrors the kid app's module → sub-mode → levels.
  const rows = MODULE_ORDER.flatMap((module) => {
    const def = moduleByName.get(module);
    const sms = subModesByModule.get(module) ?? [{ key: 'default', name: { fr: 'Défaut', en: 'Default' } }];
    return sms.map((sm) => ({
      module,
      name: asBilingual(def?.name),
      slug: def?.slug ?? module,
      sub_mode: sm.key,
      sub_mode_name: asBilingual(sm.name),
      cells: LEVELS.map((level) => ({
        level,
        plan_status: planByKey.get(`${module}:${sm.key}:${level}`) ?? 'pending',
        pool_confirmed: confirmedByKey.get(`${module}:${sm.key}:${level}`) ?? 0,
        pool_target: POOL_TARGET,
      })),
    }));
  });

  return ContentMatrixResponseSchema.parse({
    curriculum_id: curriculumId,
    pool_target: POOL_TARGET,
    rows,
  });
}

// ─── C2 · Plan ───────────────────────────────────────────────────────────────

// ContentPlan is keyed on (curriculum, module, sub_mode, level) — one plan per
// sub-mode, mirroring the kid app's module → sub-mode → levels structure.
async function loadPlanRow(
  curriculumId: string,
  module: Module,
  level: Level,
  subMode: string,
) {
  return prisma.contentPlan.findUnique({
    where: {
      curriculumId_moduleId_subMode_level: { curriculumId, moduleId: module, subMode, level },
    },
  });
}

/** Objectives from prior levels OF THE SAME SUB-MODE (continuity context); empty for level 1. */
async function prevContext(curriculumId: string, module: Module, subMode: string, level: Level) {
  if (level <= 1) return [];
  const rows = await prisma.contentPlan.findMany({
    where: { curriculumId, moduleId: module, subMode, level: { lt: level } },
    orderBy: { level: 'desc' },
    select: { level: true, pedagogicalObjectives: true, status: true },
  });
  return rows.map((r) => ({
    level: r.level as Level,
    objectives: asBilingualArray(r.pedagogicalObjectives),
  }));
}

/** True when every previous level of THIS sub-mode has an accepted plan (else editor is gated). */
async function prereqsMet(
  curriculumId: string,
  module: Module,
  subMode: string,
  level: Level,
): Promise<boolean> {
  if (level <= 1) return true;
  const acceptedPriors = await prisma.contentPlan.count({
    where: { curriculumId, moduleId: module, subMode, level: { lt: level }, status: 'accepted' },
  });
  return acceptedPriors >= level - 1;
}

export async function getPlan(module: Module, subMode: string, level: Level): Promise<PlanResponse> {
  const curriculumId = await getDefaultCurriculumId();
  const [row, prev, prereqs] = await Promise.all([
    loadPlanRow(curriculumId, module, level, subMode),
    prevContext(curriculumId, module, subMode, level),
    prereqsMet(curriculumId, module, subMode, level),
  ]);
  return PlanResponseSchema.parse({
    module,
    sub_mode: subMode,
    level,
    plan: row ? mapPlan(row) : null,
    prev_context: prev,
    prereqs_met: prereqs,
  });
}

/** Upsert the editable plan fields (PUT). Does not change accepted status. */
export async function savePlan(body: SavePlanRequest): Promise<ContentPlan> {
  const curriculumId = await getDefaultCurriculumId();
  const existing = await loadPlanRow(curriculumId, body.module, body.level, body.sub_mode);

  const data = {
    scope: body.scope as Prisma.InputJsonValue,
    pedagogicalObjectives: body.pedagogical_objectives as unknown as Prisma.InputJsonValue,
    validationCriteria: body.validation_criteria as Prisma.InputJsonValue,
    notes: body.notes ?? null,
  };

  const row = await prisma.contentPlan.upsert({
    where: {
      curriculumId_moduleId_subMode_level: {
        curriculumId,
        moduleId: body.module,
        subMode: body.sub_mode,
        level: body.level,
      },
    },
    create: {
      curriculumId,
      moduleId: body.module,
      subMode: body.sub_mode,
      level: body.level,
      // A manually-saved plan that wasn't an AI draft stays pending until accepted.
      status: existing?.status === 'accepted' ? 'accepted' : existing?.status ?? 'pending',
      ...data,
    },
    update: data,
  });
  return mapPlan(row);
}

/** Persist a streamed AI draft: writes parsed fields + ai_meta, status → ai_draft. */
export async function saveAiDraft(
  module: Module,
  subMode: string,
  level: Level,
  draft: { scope: BilingualText; pedagogical_objectives: BilingualText[]; validation_criteria: BilingualText },
  meta: { provider: string; model: string; tokens: number },
): Promise<void> {
  const curriculumId = await getDefaultCurriculumId();
  const aiMeta = { ...meta, generated_at: new Date().toISOString() };
  const data = {
    scope: draft.scope as Prisma.InputJsonValue,
    pedagogicalObjectives: draft.pedagogical_objectives as unknown as Prisma.InputJsonValue,
    validationCriteria: draft.validation_criteria as Prisma.InputJsonValue,
    status: 'ai_draft' as const,
    aiMeta: aiMeta as Prisma.InputJsonValue,
  };
  await prisma.contentPlan.upsert({
    where: {
      curriculumId_moduleId_subMode_level: {
        curriculumId,
        moduleId: module,
        subMode,
        level,
      },
    },
    create: {
      curriculumId,
      moduleId: module,
      subMode,
      level,
      notes: null,
      ...data,
    },
    update: data,
  });
}

/** Build the AI streaming inputs for a level (module metadata + continuity). */
export async function planStreamInput(module: Module, subMode: string, level: Level, actorId: string) {
  const curriculumId = await getDefaultCurriculumId();
  const [def, prev] = await Promise.all([
    prisma.moduleDef.findUnique({ where: { id: module }, select: { name: true, characteristics: true } }),
    prevContext(curriculumId, module, subMode, level),
  ]);
  return {
    module,
    level,
    moduleName: asBilingual(def?.name),
    characteristics: def?.characteristics ?? {},
    prevContext: prev,
    actorId,
  };
}

/**
 * Accept a plan: enforce FR/EN parity on every field, flip status → accepted, stamp
 * the actor. Throws 422 when parity is missing (brief: parity enforced at accept).
 */
export async function acceptPlan(
  module: Module,
  subMode: string,
  level: Level,
  actorId: string,
): Promise<ContentPlan> {
  const curriculumId = await getDefaultCurriculumId();
  const row = await loadPlanRow(curriculumId, module, level, subMode);
  if (!row) throw new HttpError(404, 'plan_not_found', 'No plan to accept for this level');

  const scope = asBilingual(row.scope);
  const objectives = asBilingualArray(row.pedagogicalObjectives);
  const validation = asBilingual(row.validationCriteria);

  const parityOk =
    scope.fr.trim() &&
    scope.en.trim() &&
    validation.fr.trim() &&
    validation.en.trim() &&
    objectives.length > 0 &&
    objectives.every((o) => o.fr.trim() && o.en.trim());

  if (!parityOk) {
    throw new HttpError(
      422,
      'parity_required',
      'Scope, objectives and validation must be filled in both FR and EN before accepting',
    );
  }

  const updated = await prisma.contentPlan.update({
    where: {
      curriculumId_moduleId_subMode_level: {
        curriculumId,
        moduleId: module,
        subMode,
        level,
      },
    },
    data: { status: 'accepted', acceptedBy: actorId, acceptedAt: new Date() },
  });
  return mapPlan(updated);
}

// ─── C3/C4 · Pool ──────────────────────────────────────────────────────────

export async function getPool(module: Module, subMode: string, level: Level): Promise<PoolResponse> {
  const curriculumId = await getDefaultCurriculumId();
  const [planRow, questionRows] = await Promise.all([
    loadPlanRow(curriculumId, module, level, subMode),
    prisma.question.findMany({
      where: { curriculumId, module, subMode, level, status: { in: ['candidate', 'confirmed'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  // Malformed rows (legacy AI candidates with array answers, etc.) are skipped
  // here so a single bad row doesn't 500 the entire pool view.
  const mapped = questionRows.map(tryMapAdminQuestion).filter((q): q is AdminQuestion => q !== null);
  const candidates = mapped.filter((q) => q.status === 'candidate');
  const confirmed = mapped.filter((q) => q.status === 'confirmed');
  const ratedHigh = candidates.filter(
    (q) => q.ratings.fr.score >= 4 && q.ratings.en.score >= 4,
  ).length;

  return PoolResponseSchema.parse({
    module,
    sub_mode: subMode,
    level,
    pool_target: POOL_TARGET,
    plan_accepted: planRow?.status === 'accepted',
    objectives: planRow ? asBilingualArray(planRow.pedagogicalObjectives) : [],
    candidates,
    confirmed,
    rated_high: ratedHigh,
  });
}

/**
 * Generate a batch of candidate questions via the AI provider and insert them.
 * Requires the level's plan to be accepted. Returns the refreshed pool.
 */
export async function generateQuestions(
  body: GenerateQuestionsRequest,
  actorId: string,
): Promise<PoolResponse> {
  const curriculumId = await getDefaultCurriculumId();
  // Pin the batch to one sub-mode (short key) — plans + pools are per-sub-mode now.
  const subMode = normalizeSubModeForPersist(body.module, body.sub_mode);
  const [planRow, def] = await Promise.all([
    loadPlanRow(curriculumId, body.module, body.level, subMode),
    prisma.moduleDef.findUnique({
      where: { id: body.module },
      select: { name: true, characteristics: true },
    }),
  ]);
  if (planRow?.status !== 'accepted') {
    throw new HttpError(409, 'plan_not_accepted', 'Accept the plan before generating questions');
  }

  const result = await getAiProvider().generateQuestions({
    module: body.module,
    level: body.level,
    moduleName: asBilingual(def?.name),
    characteristics: def?.characteristics ?? {},
    scope: asBilingual(planRow.scope),
    objectives: asBilingualArray(planRow.pedagogicalObjectives),
    validationCriteria: asBilingual(planRow.validationCriteria),
    batchSize: body.batch_size,
    difficultyHint: body.difficulty_hint,
    themes: body.themes,
    instructions: body.instructions,
    subMode,
    actorId,
  });

  await insertCandidates(curriculumId, body.module, subMode, body.level, result.questions);
  return getPool(body.module, subMode, body.level);
}

function clampDifficulty(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}

async function insertCandidates(
  curriculumId: string,
  module: Module,
  subMode: string,
  level: Level,
  drafts: DraftedQuestion[],
): Promise<void> {
  if (drafts.length === 0) return;
  // Sequence ids strictly above the highest existing AI suffix for this slot — using
  // count(*) instead leaves gaps after deletions, so new ids collide with surviving
  // rows and skipDuplicates silently drops the whole batch.
  const prefix = `${module}-${subMode}-l${level}-l${POOL_LESSON}-ai-`;
  const existingIds = await prisma.question.findMany({
    where: { curriculumId, module, subMode, level, id: { startsWith: prefix } },
    select: { id: true },
  });
  const maxN = existingIds.reduce((m, r) => {
    const n = Number(r.id.slice(prefix.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);

  const data: Prisma.QuestionCreateManyInput[] = drafts
    .filter((d) => d.prompt !== undefined && d.answer !== undefined)
    .map((d, i) => ({
      id: `${prefix}${String(maxN + i + 1).padStart(3, '0')}`,
      curriculumId,
      module,
      // The batch is pinned to one sub-mode (plans/pools are per-sub-mode), so
      // every generated row is tagged with it — the pool view filters on this key.
      subMode,
      level,
      lesson: POOL_LESSON,
      theme: d.theme || 'general',
      type: d.type,
      objectiveRef: d.objective_ref,
      prompt: d.prompt as Prisma.InputJsonValue,
      answer: d.answer as Prisma.InputJsonValue,
      distractors: (d.distractors ?? []) as unknown as Prisma.InputJsonValue,
      difficulty: clampDifficulty(d.difficulty),
      conceptTags: d.concept_tags ?? [],
      lang: d.lang,
      // code-grid (and any future per-type payload) lives in `config` — the kid app
      // uses it to render the grid/start/goals/program. Drop undefined so Prisma
      // doesn't write `null` over the column default.
      config: d.config === undefined ? undefined : (d.config as Prisma.InputJsonValue),
      createdBy: 'ai',
      ratings: [] as unknown as Prisma.InputJsonValue,
      status: 'candidate',
    }));

  await prisma.question.createMany({ data, skipDuplicates: true });
}

/**
 * Confirm a pool: promote the top high-rated candidates to `confirmed` (visible to
 * kids). Requires at least POOL_TARGET candidates rated ≥ 4 in both languages.
 */
export async function confirmPool(
  module: Module,
  subMode: string,
  level: Level,
): Promise<ConfirmPoolResponse> {
  const curriculumId = await getDefaultCurriculumId();
  const candidates = await prisma.question.findMany({
    where: { curriculumId, module, subMode, level, status: 'candidate' },
    orderBy: { createdAt: 'asc' },
  });

  const ratedHigh = candidates
    .map((q) => ({ q, r: ratingRollup(q.ratings) }))
    .filter((x) => x.r.fr.score >= 4 && x.r.en.score >= 4);

  if (ratedHigh.length < POOL_TARGET) {
    throw new HttpError(
      409,
      'pool_under_target',
      `Need at least ${POOL_TARGET} candidates rated >= 4 in both languages (have ${ratedHigh.length})`,
    );
  }

  // Promote the strongest (by combined rating), capped at the target.
  const ranked = ratedHigh
    .sort((a, b) => b.r.fr.score + b.r.en.score - (a.r.fr.score + a.r.en.score))
    .slice(0, POOL_TARGET);

  await prisma.question.updateMany({
    where: { id: { in: ranked.map((x) => x.q.id) } },
    data: { status: 'confirmed' },
  });

  return { confirmed: ranked.length };
}

// ─── Per-question review (PATCH) ─────────────────────────────────────────────

/**
 * Apply a per-language rating and/or status change, recomputing avgRating across all
 * recorded ratings. Returns the updated AdminQuestion.
 */
export async function reviewQuestion(
  id: string,
  body: ReviewQuestionRequest,
  actorId: string,
): Promise<AdminQuestion> {
  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'question_not_found', `No question "${id}"`);

  const ratings = Array.isArray(existing.ratings)
    ? (existing.ratings as Array<{ rater_id: string; score: number; lang?: string }>)
    : [];

  // Replace this rater's prior rating for the given language(s).
  const next = [...ratings];
  const setRating = (lang: 'fr' | 'en', score: number) => {
    const idx = next.findIndex((r) => r.rater_id === actorId && r.lang === lang);
    const entry = { rater_id: actorId, score, lang };
    if (idx >= 0) next[idx] = entry;
    else next.push(entry);
  };
  if (body.rating?.fr !== undefined) setRating('fr', body.rating.fr);
  if (body.rating?.en !== undefined) setRating('en', body.rating.en);

  const avg = next.length ? next.reduce((s, r) => s + r.score, 0) / next.length : null;

  const updated = await prisma.question.update({
    where: { id },
    data: {
      ratings: next as unknown as Prisma.InputJsonValue,
      avgRating: avg,
      ...(body.status ? { status: body.status } : {}),
    },
  });
  return mapAdminQuestion(updated);
}
